import Foundation

public struct ActivePolicySnapshot: Codable, Equatable, Sendable {
    public let policyVersion: UInt64
    public let generatedAt: Int64
    public let generatedUptime: TimeInterval
    public let activeOccurrences: [BlockingOccurrence]

    public init(
        policyVersion: UInt64,
        generatedAt: Int64,
        generatedUptime: TimeInterval,
        activeOccurrences: [BlockingOccurrence]
    ) {
        self.policyVersion = policyVersion
        self.generatedAt = generatedAt
        self.generatedUptime = generatedUptime
        self.activeOccurrences = activeOccurrences
    }

    public func stillActiveOccurrences(currentUptime: TimeInterval) -> [BlockingOccurrence] {
        guard currentUptime >= generatedUptime else { return [] } // reboot invalidates the monotonic anchor
        let trustedNow = generatedAt + Int64(currentUptime - generatedUptime)
        return activeOccurrences.filter { trustedNow >= $0.startsAt && trustedNow < $0.endsAt }
    }
}

public protocol EnforcementSink: Sendable {
    func apply(_ snapshot: ActivePolicySnapshot) async throws
}

public actor FileEnforcementSink: EnforcementSink {
    private let url: URL

    public init(url: URL) {
        self.url = url
    }

    public func apply(_ snapshot: ActivePolicySnapshot) throws {
        let directory = url.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        try encoder.encode(snapshot).write(to: url, options: [.atomic, .completeFileProtection])
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
    }
}

public actor EnforcementEngine {
    private struct Deadline: Sendable {
        let occurrence: BlockingOccurrence
        let startUptime: TimeInterval
        let endUptime: TimeInterval
    }

    private let verifier: PolicyVerifier
    private let store: RootPolicyStore
    private let wallClock: any WallClock
    private let monotonicClock: any MonotonicClock
    private let sink: any EnforcementSink
    private var boundDeviceID: UUID?

    private var policy: BlockingPolicy?
    private var deadlines: [UUID: Deadline] = [:]
    private var cancelledNormal = Set<UUID>()
    private var bypassed = Set<UUID>()
    private var lastError: String?

    public init(
        verifier: PolicyVerifier,
        store: RootPolicyStore,
        wallClock: any WallClock,
        monotonicClock: any MonotonicClock,
        sink: any EnforcementSink,
        deviceID: UUID? = nil
    ) {
        self.verifier = verifier
        self.store = store
        self.wallClock = wallClock
        self.monotonicClock = monotonicClock
        self.sink = sink
        self.boundDeviceID = deviceID
    }

    public func restore() async throws {
        guard let envelope = await store.snapshot().policyEnvelope else { return }
        let verified = try verifier.verify(envelope, now: wallClock.now())
        try bindDevice(verified.deviceID)
        installDeadlines(for: verified)
        policy = verified
        try await publish()
    }

    public func apply(_ envelope: SignedPolicy) async throws {
        let now = wallClock.now()
        let verified = try verifier.verify(envelope, now: now)
        try bindDevice(verified.deviceID)
        try await store.accept(policy: envelope, version: verified.policyVersion)
        policy = verified
        cancelledNormal.removeAll()
        bypassed.removeAll()
        installDeadlines(for: verified)
        try await publish()
    }

    public func cancelNormal(occurrenceID: UUID) async throws {
        guard let occurrence = policy?.occurrences.first(where: { $0.id == occurrenceID }),
              occurrence.mode == .normal else {
            return
        }
        cancelledNormal.insert(occurrenceID)
        try await publish()
    }

    public func redeem(_ envelope: SignedBypassToken) async throws {
        let now = wallClock.now()
        let token = try verifier.verify(envelope, now: now)
        guard let boundDeviceID, token.deviceID == boundDeviceID else {
            throw ProtocolError.wrongDevice
        }
        guard policy?.occurrences.contains(where: { $0.id == token.occurrenceID }) == true else {
            throw ProtocolError.malformedEnvelope
        }
        try await store.consume(nonce: token.nonce, expiresAt: token.expiresAt, now: now)
        bypassed.insert(token.occurrenceID)
        try await publish()
    }

    public func tick() async {
        do {
            try await publish()
            lastError = nil
        } catch {
            lastError = String(describing: error)
            // Do not clear extension state here. Existing verified strict state remains
            // fail-closed until its monotonic deadline; normal state may be cancelled.
        }
    }

    public func activeOccurrences() -> [BlockingOccurrence] {
        let uptime = monotonicClock.uptime()
        return deadlines.values.compactMap { deadline in
            guard uptime >= deadline.startUptime, uptime < deadline.endUptime,
                  !bypassed.contains(deadline.occurrence.id) else { return nil }
            if deadline.occurrence.mode == .normal, cancelledNormal.contains(deadline.occurrence.id) {
                return nil
            }
            return deadline.occurrence
        }.sorted { $0.id.uuidString < $1.id.uuidString }
    }

    public func status() -> EnforcementStatus {
        let active = activeOccurrences()
        return EnforcementStatus(
            policyVersion: policy?.policyVersion,
            activeOccurrenceIDs: active.map(\.id),
            strictOccurrenceIDs: active.filter { $0.mode == .strict }.map(\.id),
            policyExpiresAt: policy?.expiresAt,
            lastError: lastError
        )
    }

    public func hasActiveStrictOccurrence() -> Bool {
        activeOccurrences().contains { $0.mode == .strict }
    }

    private func bindDevice(_ deviceID: UUID) throws {
        if let boundDeviceID {
            guard boundDeviceID == deviceID else { throw ProtocolError.wrongDevice }
        } else {
            boundDeviceID = deviceID
        }
    }

    private func installDeadlines(for policy: BlockingPolicy) {
        let wallNow = wallClock.now()
        let uptimeNow = monotonicClock.uptime()
        deadlines = Dictionary(uniqueKeysWithValues: policy.occurrences.map { occurrence in
            (
                occurrence.id,
                Deadline(
                    occurrence: occurrence,
                    startUptime: uptimeNow + TimeInterval(occurrence.startsAt - wallNow),
                    endUptime: uptimeNow + TimeInterval(occurrence.endsAt - wallNow)
                )
            )
        })
    }

    private func publish() async throws {
        guard let policy else { return }
        try await sink.apply(
            ActivePolicySnapshot(
                policyVersion: policy.policyVersion,
                generatedAt: wallClock.now(),
                generatedUptime: monotonicClock.uptime(),
                activeOccurrences: activeOccurrences()
            )
        )
    }
}

public enum Matchers {
    public static func normalizedDomain(_ raw: String) -> String? {
        var value = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if value.hasSuffix(".") { value.removeLast() }
        guard !value.isEmpty,
              value.unicodeScalars.allSatisfy({
                  CharacterSet.alphanumerics.contains($0) || $0 == "." || $0 == "-"
              }),
              !value.contains("..") else { return nil }
        return value
    }

    public static func domain(_ candidate: String, matches blocked: String) -> Bool {
        guard let candidate = normalizedDomain(candidate),
              let blocked = normalizedDomain(blocked) else { return false }
        return candidate == blocked || candidate.hasSuffix(".\(blocked)")
    }

    public static func application(
        signingIdentifier: String?,
        bundleIdentifier: String?,
        executablePath: String,
        matches blocked: AppIdentity
    ) -> Bool {
        if let expected = blocked.signingIdentifier, expected == signingIdentifier { return true }
        if let expected = blocked.bundleIdentifier, expected == bundleIdentifier { return true }
        if let expected = blocked.executablePath {
            return URL(fileURLWithPath: expected).standardizedFileURL.path
                == URL(fileURLWithPath: executablePath).standardizedFileURL.path
        }
        return false
    }
}
