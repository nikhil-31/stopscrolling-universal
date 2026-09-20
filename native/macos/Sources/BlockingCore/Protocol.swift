import Foundation

public enum BlockingMode: String, Codable, Sendable {
    case normal
    case strict
}

public struct AppIdentity: Codable, Hashable, Sendable {
    public let signingIdentifier: String?
    public let bundleIdentifier: String?
    public let executablePath: String?

    public init(signingIdentifier: String? = nil, bundleIdentifier: String? = nil, executablePath: String? = nil) {
        self.signingIdentifier = signingIdentifier
        self.bundleIdentifier = bundleIdentifier
        self.executablePath = executablePath
    }
}

public struct BlockingOccurrence: Codable, Equatable, Sendable {
    public let id: UUID
    public let startsAt: Int64
    public let endsAt: Int64
    public let mode: BlockingMode
    public let domains: [String]
    public let applications: [AppIdentity]

    public init(
        id: UUID,
        startsAt: Int64,
        endsAt: Int64,
        mode: BlockingMode,
        domains: [String],
        applications: [AppIdentity]
    ) {
        self.id = id
        self.startsAt = startsAt
        self.endsAt = endsAt
        self.mode = mode
        self.domains = domains
        self.applications = applications
    }
}

public struct BlockingPolicy: Codable, Equatable, Sendable {
    public let schemaVersion: Int
    public let policyVersion: UInt64
    public let deviceID: UUID
    public let issuedAt: Int64
    public let expiresAt: Int64
    public let occurrences: [BlockingOccurrence]
    public let algorithm: String
    public let keyID: String

    public init(
        schemaVersion: Int = 1,
        policyVersion: UInt64,
        deviceID: UUID,
        issuedAt: Int64,
        expiresAt: Int64,
        occurrences: [BlockingOccurrence],
        algorithm: String = "Ed25519",
        keyID: String = "test"
    ) {
        self.schemaVersion = schemaVersion
        self.policyVersion = policyVersion
        self.deviceID = deviceID
        self.issuedAt = issuedAt
        self.expiresAt = expiresAt
        self.occurrences = occurrences
        self.algorithm = algorithm
        self.keyID = keyID
    }

    private enum CodingKeys: String, CodingKey {
        case policyVersion = "policy_version"
        case deviceID = "device_id"
        case issuedAt = "server_time"
        case expiresAt = "expires_at"
        case occurrences, algorithm
        case keyID = "kid"
    }

    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        policyVersion = try values.decode(UInt64.self, forKey: .policyVersion)
        deviceID = try values.decode(UUID.self, forKey: .deviceID)
        issuedAt = try ContractTimestamp.decode(values.decode(String.self, forKey: .issuedAt))
        expiresAt = try ContractTimestamp.decode(values.decode(String.self, forKey: .expiresAt))
        occurrences = try values.decode([WireOccurrence].self, forKey: .occurrences).map {
            try $0.occurrence
        }
        algorithm = try values.decode(String.self, forKey: .algorithm)
        keyID = try values.decode(String.self, forKey: .keyID)
        schemaVersion = 1
    }

    public func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(policyVersion, forKey: .policyVersion)
        try values.encode(deviceID, forKey: .deviceID)
        try values.encode(ContractTimestamp.encode(issuedAt), forKey: .issuedAt)
        try values.encode(ContractTimestamp.encode(expiresAt), forKey: .expiresAt)
        try values.encode(occurrences.map(WireOccurrence.init), forKey: .occurrences)
        try values.encode(algorithm, forKey: .algorithm)
        try values.encode(keyID, forKey: .keyID)
    }
}

public struct SignedPolicy: Codable, Sendable {
    /// RFC 4648 base64 encoded canonical JSON for `BlockingPolicy`.
    public let payload: String
    /// RFC 4648 base64 encoded Ed25519 signature over the decoded payload bytes.
    public let signature: String
    public let keyID: String

    public init(payload: String, signature: String, keyID: String) {
        self.payload = payload
        self.signature = signature
        self.keyID = keyID
    }
}

public struct BypassToken: Codable, Equatable, Sendable {
    public let occurrenceID: UUID
    public let deviceID: UUID
    public let nonce: String
    public let issuedAt: Int64
    public let expiresAt: Int64
    public let type: String
    public let action: String
    public let keyID: String

    public init(
        occurrenceID: UUID,
        deviceID: UUID,
        nonce: String,
        issuedAt: Int64,
        expiresAt: Int64,
        type: String = "blocking_bypass",
        action: String = "disable_blocking",
        keyID: String = "test"
    ) {
        self.occurrenceID = occurrenceID
        self.deviceID = deviceID
        self.nonce = nonce
        self.issuedAt = issuedAt
        self.expiresAt = expiresAt
        self.type = type
        self.action = action
        self.keyID = keyID
    }

    private enum CodingKeys: String, CodingKey {
        case occurrenceID = "occurrence_id"
        case deviceID = "device_id"
        case nonce
        case issuedAt = "issued_at"
        case expiresAt = "expires_at"
        case type, action
        case keyID = "kid"
    }

    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        occurrenceID = try values.decode(UUID.self, forKey: .occurrenceID)
        deviceID = try values.decode(UUID.self, forKey: .deviceID)
        nonce = try values.decode(String.self, forKey: .nonce)
        issuedAt = try ContractTimestamp.decode(values.decode(String.self, forKey: .issuedAt))
        expiresAt = try ContractTimestamp.decode(values.decode(String.self, forKey: .expiresAt))
        type = try values.decode(String.self, forKey: .type)
        action = try values.decode(String.self, forKey: .action)
        keyID = try values.decode(String.self, forKey: .keyID)
    }

    public func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(occurrenceID, forKey: .occurrenceID)
        try values.encode(deviceID, forKey: .deviceID)
        try values.encode(nonce, forKey: .nonce)
        try values.encode(ContractTimestamp.encode(issuedAt), forKey: .issuedAt)
        try values.encode(ContractTimestamp.encode(expiresAt), forKey: .expiresAt)
        try values.encode(type, forKey: .type)
        try values.encode(action, forKey: .action)
        try values.encode(keyID, forKey: .keyID)
    }
}

private struct WireEntry: Codable {
    let entryType: String
    let identifier: String
    let label: String

    enum CodingKeys: String, CodingKey {
        case entryType = "entry_type"
        case identifier, label
    }
}

private struct WireOccurrence: Codable {
    let occurrenceID: UUID
    let scheduleID: UUID
    let scheduleName: String
    let strictMode: Bool
    let startAt: String
    let endAt: String
    let entries: [WireEntry]

    enum CodingKeys: String, CodingKey {
        case occurrenceID = "occurrence_id"
        case scheduleID = "schedule_id"
        case scheduleName = "schedule_name"
        case strictMode = "strict_mode"
        case startAt = "start_at"
        case endAt = "end_at"
        case entries
    }

    init(_ occurrence: BlockingOccurrence) {
        occurrenceID = occurrence.id
        scheduleID = occurrence.id
        scheduleName = ""
        strictMode = occurrence.mode == .strict
        startAt = ContractTimestamp.encode(occurrence.startsAt)
        endAt = ContractTimestamp.encode(occurrence.endsAt)
        entries =
            occurrence.domains.map { WireEntry(entryType: "website", identifier: $0, label: "") } +
            occurrence.applications.compactMap {
                ($0.signingIdentifier ?? $0.bundleIdentifier ?? $0.executablePath).map {
                    WireEntry(entryType: "app", identifier: $0, label: "")
                }
            }
    }

    var occurrence: BlockingOccurrence {
        get throws {
            let domains = entries.filter { $0.entryType == "website" }.map(\.identifier)
            let applications = entries.filter { $0.entryType == "app" }.map {
                AppIdentity(signingIdentifier: $0.identifier)
            }
            guard domains.count + applications.count == entries.count else {
                throw ProtocolError.malformedEnvelope
            }
            return BlockingOccurrence(
                id: occurrenceID,
                startsAt: try ContractTimestamp.decode(startAt),
                endsAt: try ContractTimestamp.decode(endAt),
                mode: strictMode ? .strict : .normal,
                domains: domains,
                applications: applications
            )
        }
    }
}

enum ContractTimestamp {
    static func decode(_ value: String) throws -> Int64 {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let wholeSecond = ISO8601DateFormatter()
        wholeSecond.formatOptions = [.withInternetDateTime]
        guard let date = fractional.date(from: value) ?? wholeSecond.date(from: value) else {
            throw ProtocolError.malformedEnvelope
        }
        return Int64(date.timeIntervalSince1970)
    }

    static func encode(_ value: Int64) -> String {
        let wholeSecond = ISO8601DateFormatter()
        wholeSecond.formatOptions = [.withInternetDateTime]
        return wholeSecond.string(from: Date(timeIntervalSince1970: TimeInterval(value)))
    }
}

public struct SignedBypassToken: Codable, Sendable {
    public let payload: String
    public let signature: String
    public let keyID: String
}

public struct EnforcementStatus: Codable, Equatable, Sendable {
    public let policyVersion: UInt64?
    public let activeOccurrenceIDs: [UUID]
    public let strictOccurrenceIDs: [UUID]
    public let policyExpiresAt: Int64?
    public let lastError: String?

    public init(
        policyVersion: UInt64?,
        activeOccurrenceIDs: [UUID],
        strictOccurrenceIDs: [UUID],
        policyExpiresAt: Int64?,
        lastError: String?
    ) {
        self.policyVersion = policyVersion
        self.activeOccurrenceIDs = activeOccurrenceIDs
        self.strictOccurrenceIDs = strictOccurrenceIDs
        self.policyExpiresAt = policyExpiresAt
        self.lastError = lastError
    }

    private enum CodingKeys: String, CodingKey {
        case policyVersion, activeOccurrenceIDs, strictOccurrenceIDs, policyExpiresAt, lastError
    }

    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        policyVersion = try values.decodeIfPresent(UInt64.self, forKey: .policyVersion)
        activeOccurrenceIDs = try values.decode([UUID].self, forKey: .activeOccurrenceIDs)
        strictOccurrenceIDs = try values.decode([UUID].self, forKey: .strictOccurrenceIDs)
        policyExpiresAt = try values.decodeIfPresent(Int64.self, forKey: .policyExpiresAt)
        lastError = try values.decodeIfPresent(String.self, forKey: .lastError)
    }

    public func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encodeIfPresent(policyVersion, forKey: .policyVersion)
        try values.encode(activeOccurrenceIDs.map { $0.uuidString.lowercased() }, forKey: .activeOccurrenceIDs)
        try values.encode(strictOccurrenceIDs.map { $0.uuidString.lowercased() }, forKey: .strictOccurrenceIDs)
        try values.encodeIfPresent(policyExpiresAt, forKey: .policyExpiresAt)
        try values.encodeIfPresent(lastError, forKey: .lastError)
    }
}

public struct InstalledApplication: Codable, Equatable, Sendable {
    public let displayName: String
    public let bundleIdentifier: String?
    public let signingIdentifier: String?
    public let executablePath: String
}

public enum HelperOperation: String, Codable, Sendable {
    case applyPolicy
    case status
    case redeemBypass
    case inventory
    case cancelNormal
}

public enum ProtocolError: Error, Equatable {
    case malformedEnvelope
    case nonCanonicalPayload
    case unknownKey
    case invalidSignature
    case unsupportedSchema
    case expired
    case notYetValid
    case stalePolicy
    case replayedNonce
    case wrongDevice
    case unauthorizedClient
}
