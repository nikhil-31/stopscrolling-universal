import Darwin
import Foundation

public protocol WallClock: Sendable {
    func now() -> Int64
}

public protocol MonotonicClock: Sendable {
    func uptime() -> TimeInterval
}

public struct SystemWallClock: WallClock {
    public init() {}
    public func now() -> Int64 { Int64(Date().timeIntervalSince1970) }
}

public struct SystemMonotonicClock: MonotonicClock {
    public init() {}
    public func uptime() -> TimeInterval { ProcessInfo.processInfo.systemUptime }
}

public struct PersistedState: Codable, Sendable {
    public var policyEnvelope: SignedPolicy?
    public var highestPolicyVersion: UInt64
    public var redeemedNonces: [String: Int64]

    public init(
        policyEnvelope: SignedPolicy? = nil,
        highestPolicyVersion: UInt64 = 0,
        redeemedNonces: [String: Int64] = [:]
    ) {
        self.policyEnvelope = policyEnvelope
        self.highestPolicyVersion = highestPolicyVersion
        self.redeemedNonces = redeemedNonces
    }
}

public actor RootPolicyStore {
    public static let defaultURL = URL(fileURLWithPath: "/Library/Application Support/StopScrolling/enforcement.json")

    private let url: URL
    private var state: PersistedState

    public init(url: URL = RootPolicyStore.defaultURL) throws {
        self.url = url
        if FileManager.default.fileExists(atPath: url.path) {
            let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
            let owner = attributes[.ownerAccountID] as? NSNumber
            let permissions = attributes[.posixPermissions] as? NSNumber
            guard owner?.uint32Value == 0 || url != Self.defaultURL else {
                throw CocoaError(.fileReadNoPermission)
            }
            guard (permissions?.intValue ?? 0) & 0o022 == 0 else {
                throw CocoaError(.fileReadNoPermission)
            }
            state = try JSONDecoder().decode(PersistedState.self, from: Data(contentsOf: url))
        } else {
            state = PersistedState()
        }
    }

    public func snapshot() -> PersistedState { state }

    public func accept(policy envelope: SignedPolicy, version: UInt64) throws {
        guard version > state.highestPolicyVersion else { throw ProtocolError.stalePolicy }
        state.policyEnvelope = envelope
        state.highestPolicyVersion = version
        try persist()
    }

    public func consume(nonce: String, expiresAt: Int64, now: Int64) throws {
        state.redeemedNonces = state.redeemedNonces.filter { $0.value > now }
        guard state.redeemedNonces[nonce] == nil else { throw ProtocolError.replayedNonce }
        state.redeemedNonces[nonce] = expiresAt
        try persist()
    }

    private func persist() throws {
        let directory = url.deletingLastPathComponent()
        try FileManager.default.createDirectory(
            at: directory,
            withIntermediateDirectories: true,
            attributes: [.posixPermissions: 0o700]
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let data = try encoder.encode(state)
        let temporary = directory.appendingPathComponent(".\(url.lastPathComponent).\(UUID().uuidString)")
        guard FileManager.default.createFile(
            atPath: temporary.path,
            contents: data,
            attributes: [.posixPermissions: 0o600]
        ) else {
            throw CocoaError(.fileWriteUnknown)
        }
        if geteuid() == 0 {
            guard chown(temporary.path, 0, 0) == 0 else {
                try? FileManager.default.removeItem(at: temporary)
                throw CocoaError(.fileWriteNoPermission)
            }
        } else if url == Self.defaultURL {
            try? FileManager.default.removeItem(at: temporary)
            throw CocoaError(.fileWriteNoPermission)
        }
        _ = try FileManager.default.replaceItemAt(url, withItemAt: temporary)
    }
}

private extension FileManager {
    func replaceItemAt(_ destination: URL, withItemAt source: URL) throws -> URL? {
        if fileExists(atPath: destination.path) {
            return try replaceItemAt(destination, withItemAt: source, backupItemName: nil, options: [])
        }
        try moveItem(at: source, to: destination)
        return destination
    }
}
