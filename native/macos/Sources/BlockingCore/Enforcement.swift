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

public enum FlowTransport: Equatable, Sendable {
    case tcp
    case udp
    case other
}

public struct FlowFacts: Equatable, Sendable {
    public var hostname: String?
    public var urlHost: String?
    public var remoteAddress: String?
    public var port: UInt16
    public var transport: FlowTransport
    /// `nil` means the first outbound bytes have not been read yet.
    public var outbound: Data?

    public init(
        hostname: String? = nil,
        urlHost: String? = nil,
        remoteAddress: String? = nil,
        port: UInt16,
        transport: FlowTransport,
        outbound: Data? = nil
    ) {
        self.hostname = hostname
        self.urlHost = urlHost
        self.remoteAddress = remoteAddress
        self.port = port
        self.transport = transport
        self.outbound = outbound
    }
}

public enum FlowDecision: Equatable, Sendable {
    case allow
    case drop
    case peekOutbound
}

/// Addresses learned from DNS answers for blocked names, kept until each record's TTL ends.
public final class BlockedAddressMemory: @unchecked Sendable {
    private let lock = NSLock()
    private var expiry: [String: Date] = [:]

    public init() {}

    public func recordDNS(_ data: Data, domains: [String], now: Date) {
        guard let message = DNSMessage.parse(data) else { return }
        let questionMatches = message.questions.contains { name in
            domains.contains { Matchers.domain(name, matches: $0) }
        }
        lock.lock()
        defer { lock.unlock() }
        expiry = expiry.filter { $0.value > now }
        for answer in message.answers where answer.type == 1 || answer.type == 28 {
            guard let address = answer.address else { continue }
            let nameMatches = domains.contains { Matchers.domain(answer.name, matches: $0) }
            guard questionMatches || nameMatches else { continue }
            let ttl = min(TimeInterval(answer.ttl), 24 * 60 * 60)
            let until = now.addingTimeInterval(ttl)
            if let existing = expiry[address], existing >= until { continue }
            expiry[address] = until
        }
    }

    public func contains(_ address: String, now: Date) -> Bool {
        guard let key = IPAddress.normalize(address) else { return false }
        lock.lock()
        defer { lock.unlock() }
        expiry = expiry.filter { $0.value > now }
        return expiry[key].map { $0 > now } ?? false
    }
}

public enum FlowVerdict {
    public static let dnsPort: UInt16 = 53

    /// Public resolvers that hide the lookup a content filter would otherwise see.
    public static let dnsOverHTTPSHosts = [
        "dns.google",
        "dns.google.com",
        "cloudflare-dns.com",
        "one.one.one.one",
        "dns.quad9.net",
        "doh.opendns.com",
        "dns.nextdns.io",
        "dns.adguard-dns.com",
        "doh.cleanbrowsing.org",
        "dns.sb",
        "doh.dns.apple.com",
    ]

    public static func decide(
        _ facts: FlowFacts,
        occurrences: [BlockingOccurrence],
        addresses: BlockedAddressMemory,
        now: Date
    ) -> FlowDecision {
        guard !occurrences.isEmpty else { return .allow }
        let domains = occurrences.flatMap(\.domains)
        let names = [facts.hostname, facts.urlHost].compactMap { $0 }.filter { !$0.isEmpty }

        if names.contains(where: { blocked($0, domains) }) {
            return .drop
        }
        if facts.port != dnsPort, names.contains(where: isDNSOverHTTPS) {
            return .drop
        }
        if facts.port == dnsPort {
            if names.isEmpty, facts.outbound == nil { return .peekOutbound }
            return .allow
        }
        if !names.isEmpty {
            return .allow
        }

        let remembered = facts.remoteAddress.map { addresses.contains($0, now: now) } ?? false
        if let outbound = facts.outbound {
            if let server = ServerName.read(outbound) {
                if blocked(server, domains) || isDNSOverHTTPS(server) { return .drop }
                return .allow
            }
            return remembered ? .drop : .allow
        }
        if remembered, facts.transport != .tcp {
            return .drop
        }
        return .peekOutbound
    }

    private static func blocked(_ name: String, _ domains: [String]) -> Bool {
        domains.contains { Matchers.domain(name, matches: $0) }
    }

    private static func isDNSOverHTTPS(_ name: String) -> Bool {
        dnsOverHTTPSHosts.contains { Matchers.domain(name, matches: $0) }
    }
}

private enum ServerName {
    static func read(_ data: Data) -> String? {
        if data.first == 0x16, let name = tlsServerName(data) { return name }
        return httpHost(data)
    }

    private static func tlsServerName(_ data: Data) -> String? {
        var cursor = Cursor(data)
        guard cursor.byte() == 0x16, cursor.skip(2), cursor.int(2) != nil else { return nil }
        guard cursor.byte() == 1, let helloLength = cursor.int(3) else { return nil }
        let helloEnd = min(data.count, cursor.offset + helloLength)
        guard cursor.skip(34) else { return nil }
        guard let sessionLength = cursor.byte(), cursor.skip(Int(sessionLength)) else { return nil }
        guard let cipherLength = cursor.int(2), cursor.skip(cipherLength) else { return nil }
        guard let compressionLength = cursor.byte(), cursor.skip(Int(compressionLength)) else { return nil }
        guard cursor.offset < helloEnd, let extensionsLength = cursor.int(2) else { return nil }
        let extensionsEnd = min(helloEnd, cursor.offset + extensionsLength)
        while cursor.offset + 4 <= extensionsEnd {
            guard let type = cursor.int(2), let length = cursor.int(2) else { return nil }
            let next = cursor.offset + length
            guard next <= extensionsEnd else { return nil }
            if type == 0 {
                guard let listLength = cursor.int(2), cursor.offset + listLength <= next else { return nil }
                guard cursor.byte() == 0, let nameLength = cursor.int(2), let name = cursor.slice(nameLength) else {
                    return nil
                }
                return String(bytes: name, encoding: .utf8)
            }
            cursor.offset = next
        }
        return nil
    }

    private static func httpHost(_ data: Data) -> String? {
        let bytes = Array(data.prefix(4096))
        let pattern = Array("\nhost:".utf8)
        var start: Int?
        if bytes.count >= 5, bytes.prefix(5).elementsEqual(Array("host:".utf8), by: { $0 | 0x20 == $1 | 0x20 }) {
            start = 5
        } else {
            var index = 0
            while index + pattern.count <= bytes.count {
                let window = bytes[index..<(index + pattern.count)]
                if zip(window, pattern).allSatisfy({ $0 | 0x20 == $1 | 0x20 }) {
                    start = index + pattern.count
                    break
                }
                index += 1
            }
        }
        guard let start else { return nil }
        var end = start
        while end < bytes.count, bytes[end] == 0x20 || bytes[end] == 0x09 { end += 1 }
        let hostStart = end
        while end < bytes.count, bytes[end] != 0x0d && bytes[end] != 0x0a && bytes[end] != 0x20 {
            end += 1
        }
        guard let host = String(bytes: bytes[hostStart..<end], encoding: .utf8) else { return nil }
        if host.hasPrefix("[") { return nil }
        let withoutPort = host.split(separator: ":", maxSplits: 1).first.map(String.init) ?? host
        return withoutPort
    }
}

private struct Cursor {
    var data: Data
    var offset = 0

    init(_ data: Data) { self.data = data }

    var remaining: Int { data.count - offset }

    mutating func byte() -> UInt8? {
        guard offset < data.count else { return nil }
        defer { offset += 1 }
        return data[offset]
    }

    mutating func int(_ width: Int) -> Int? {
        guard width > 0, remaining >= width else { return nil }
        var value = 0
        for _ in 0..<width {
            value = (value << 8) | Int(data[offset])
            offset += 1
        }
        return value
    }

    mutating func skip(_ count: Int) -> Bool {
        guard count >= 0, remaining >= count else { return false }
        offset += count
        return true
    }

    mutating func slice(_ count: Int) -> Data? {
        guard count >= 0, remaining >= count else { return nil }
        let end = offset + count
        let slice = data[offset..<end]
        offset = end
        return Data(slice)
    }
}

private struct DNSMessage {
    struct Answer {
        var name: String
        var type: UInt16
        var ttl: UInt32
        var address: String?
    }

    var questions: [String]
    var answers: [Answer]

    static func parse(_ data: Data) -> DNSMessage? {
        parseMessage(data, at: 0) ?? (data.count > 2 ? parseMessage(data, at: 2) : nil)
    }

    private static func parseMessage(_ data: Data, at start: Int) -> DNSMessage? {
        guard start + 12 <= data.count else { return nil }
        let flags = read16(data, start + 2)
        guard flags & 0x8000 != 0 else { return nil }
        let questionCount = Int(read16(data, start + 4))
        let answerCount = Int(read16(data, start + 6))
        guard questionCount < 64, answerCount < 64 else { return nil }
        var offset = start + 12
        var questions: [String] = []
        for _ in 0..<questionCount {
            guard let name = readName(data, &offset), offset + 4 <= data.count else { return nil }
            questions.append(name)
            offset += 4
        }
        var answers: [Answer] = []
        for _ in 0..<answerCount {
            guard let name = readName(data, &offset), offset + 10 <= data.count else { return nil }
            let type = read16(data, offset)
            let ttl = read32(data, offset + 4)
            let length = Int(read16(data, offset + 8))
            offset += 10
            guard offset + length <= data.count else { return nil }
            var address: String?
            if type == 1, length == 4 {
                address = IPAddress.normalizeV4(Array(data[offset..<(offset + 4)]))
            } else if type == 28, length == 16 {
                address = IPAddress.normalizeV6(Array(data[offset..<(offset + 16)]))
            }
            answers.append(Answer(name: name, type: type, ttl: ttl, address: address))
            offset += length
        }
        return DNSMessage(questions: questions, answers: answers)
    }

    private static func read16(_ data: Data, _ offset: Int) -> UInt16 {
        (UInt16(data[offset]) << 8) | UInt16(data[offset + 1])
    }

    private static func read32(_ data: Data, _ offset: Int) -> UInt32 {
        (UInt32(data[offset]) << 24) | (UInt32(data[offset + 1]) << 16)
            | (UInt32(data[offset + 2]) << 8) | UInt32(data[offset + 3])
    }

    private static func readName(_ data: Data, _ offset: inout Int, depth: Int = 0) -> String? {
        guard depth < 8, offset < data.count else { return nil }
        var labels: [String] = []
        var cursor = offset
        var followedPointer = false
        var steps = 0
        while steps < 128, cursor < data.count {
            steps += 1
            let length = Int(data[cursor])
            if length == 0 {
                if !followedPointer { offset = cursor + 1 }
                return labels.joined(separator: ".")
            }
            if length & 0xC0 == 0xC0 {
                guard cursor + 1 < data.count else { return nil }
                let pointer = ((length & 0x3F) << 8) | Int(data[cursor + 1])
                guard pointer < cursor else { return nil }
                if !followedPointer { offset = cursor + 2 }
                followedPointer = true
                var pointed = pointer
                guard let rest = readName(data, &pointed, depth: depth + 1) else { return nil }
                if !rest.isEmpty { labels.append(rest) }
                return labels.joined(separator: ".")
            }
            guard length & 0xC0 == 0 else { return nil }
            let start = cursor + 1
            let end = start + length
            guard end <= data.count, let text = String(bytes: data[start..<end], encoding: .utf8) else { return nil }
            labels.append(text)
            cursor = end
            if !followedPointer { offset = cursor }
        }
        return nil
    }
}

enum IPAddress {
    static func normalize(_ raw: String) -> String? {
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.contains(":") { return normalizeV6(text) }
        return normalizeV4(text)
    }

    static func normalizeV4(_ bytes: [UInt8]) -> String? {
        guard bytes.count == 4 else { return nil }
        return bytes.map(String.init).joined(separator: ".")
    }

    static func normalizeV4(_ text: String) -> String? {
        let parts = text.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 4 else { return nil }
        var octets: [UInt8] = []
        for part in parts {
            if part.count > 1, part.hasPrefix("0") { return nil }
            guard let value = Int(part), (0...255).contains(value) else { return nil }
            octets.append(UInt8(value))
        }
        return normalizeV4(octets)
    }

    static func normalizeV6(_ bytes: [UInt8]) -> String? {
        guard bytes.count == 16 else { return nil }
        if bytes[0..<10].allSatisfy({ $0 == 0 }), bytes[10] == 0xff, bytes[11] == 0xff {
            return normalizeV4(Array(bytes[12..<16]))
        }
        var groups: [UInt16] = []
        for index in stride(from: 0, to: 16, by: 2) {
            groups.append((UInt16(bytes[index]) << 8) | UInt16(bytes[index + 1]))
        }
        return compress(groups)
    }

    static func normalizeV6(_ text: String) -> String? {
        var value = text
        if value.hasPrefix("["), let end = value.firstIndex(of: "]") {
            value = String(value[value.index(after: value.startIndex)..<end])
        }
        if let zone = value.firstIndex(of: "%") {
            value = String(value[..<zone])
        }
        let sides = value.components(separatedBy: "::")
        guard sides.count <= 2 else { return nil }
        func parse(_ side: String) -> [UInt16]? {
            if side.isEmpty { return [] }
            var groups: [UInt16] = []
            let pieces = side.split(separator: ":").map(String.init)
            for (index, piece) in pieces.enumerated() {
                if piece.contains(".") {
                    guard index == pieces.count - 1, let address = normalizeV4(piece) else { return nil }
                    let octets = address.split(separator: ".").compactMap { UInt8($0) }
                    guard octets.count == 4 else { return nil }
                    groups.append((UInt16(octets[0]) << 8) | UInt16(octets[1]))
                    groups.append((UInt16(octets[2]) << 8) | UInt16(octets[3]))
                } else {
                    guard (1...4).contains(piece.count), let number = UInt16(piece, radix: 16) else { return nil }
                    groups.append(number)
                }
            }
            return groups
        }
        guard var head = parse(sides[0]) else { return nil }
        if sides.count == 2 {
            guard let tail = parse(sides[1]) else { return nil }
            let missing = 8 - head.count - tail.count
            guard missing >= 1 else { return nil }
            head.append(contentsOf: Array(repeating: 0, count: missing))
            head.append(contentsOf: tail)
        }
        guard head.count == 8 else { return nil }
        if head[0] == 0, head[1] == 0, head[2] == 0, head[3] == 0, head[4] == 0, head[5] == 0xffff {
            return "\(head[6] >> 8).\(head[6] & 0xff).\(head[7] >> 8).\(head[7] & 0xff)"
        }
        return compress(head)
    }

    private static func compress(_ groups: [UInt16]) -> String {
        var best = (start: 0, length: 0)
        var index = 0
        while index < groups.count {
            if groups[index] == 0 {
                let start = index
                while index < groups.count, groups[index] == 0 { index += 1 }
                if index - start > best.length { best = (start, index - start) }
            } else {
                index += 1
            }
        }
        let compressRun = best.length >= 2
        var result = ""
        index = 0
        while index < groups.count {
            if compressRun, index == best.start {
                result += "::"
                index += best.length
                continue
            }
            if !result.isEmpty, !result.hasSuffix(":") { result += ":" }
            result += String(groups[index], radix: 16)
            index += 1
        }
        return result.isEmpty ? "::" : result
    }
}
