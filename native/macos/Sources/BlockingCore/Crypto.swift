import CryptoKit
import Foundation

public enum CanonicalJSON {
    /// Canonical form accepted by the native boundary: UTF-8 JSON with sorted keys,
    /// no fragments, and no floating-point values. Integer timestamps avoid cross-
    /// language date/number ambiguity.
    public static func encode<T: Encodable>(_ value: T) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        let encoded = try encoder.encode(value)
        let object = try JSONSerialization.jsonObject(with: encoded)
        try validate(object)
        return try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys, .withoutEscapingSlashes])
    }

    public static func decodeCanonical<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        let object = try JSONSerialization.jsonObject(with: data)
        try validate(object)
        let canonical = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys, .withoutEscapingSlashes])
        guard canonical == data else { throw ProtocolError.nonCanonicalPayload }
        return try JSONDecoder().decode(type, from: data)
    }

    private static func validate(_ value: Any) throws {
        switch value {
        case is NSNull, is String, is Bool:
            return
        case let number as NSNumber:
            guard CFGetTypeID(number) != CFBooleanGetTypeID(),
                  CFNumberIsFloatType(number) == false else {
                throw ProtocolError.nonCanonicalPayload
            }
        case let array as [Any]:
            try array.forEach(validate)
        case let dictionary as [String: Any]:
            try dictionary.values.forEach(validate)
        default:
            throw ProtocolError.nonCanonicalPayload
        }
    }
}

public struct PolicyVerifier: Sendable {
    private let keys: [String: Curve25519.Signing.PublicKey]

    public init(base64PublicKeys: [String: String]) throws {
        self.keys = try base64PublicKeys.mapValues {
            guard let bytes = Data(base64Encoded: $0) else { throw ProtocolError.unknownKey }
            return try Curve25519.Signing.PublicKey(rawRepresentation: bytes)
        }
    }

    public func verify(_ envelope: SignedPolicy, now: Int64) throws -> BlockingPolicy {
        let policy: BlockingPolicy = try verifyPayload(
            envelope.payload,
            signature: envelope.signature,
            keyID: envelope.keyID
        )
        guard policy.schemaVersion == 1 else { throw ProtocolError.unsupportedSchema }
        guard policy.algorithm == "Ed25519", policy.keyID == envelope.keyID else {
            throw ProtocolError.unknownKey
        }
        guard policy.issuedAt <= now else { throw ProtocolError.notYetValid }
        guard policy.expiresAt > now else { throw ProtocolError.expired }
        guard policy.occurrences.allSatisfy({ $0.endsAt > $0.startsAt }) else {
            throw ProtocolError.malformedEnvelope
        }
        return policy
    }

    public func verify(_ envelope: SignedBypassToken, now: Int64) throws -> BypassToken {
        let token: BypassToken = try verifyPayload(
            envelope.payload,
            signature: envelope.signature,
            keyID: envelope.keyID
        )
        guard token.type == "blocking_bypass",
              token.action == "disable_blocking",
              token.keyID == envelope.keyID else {
            throw ProtocolError.malformedEnvelope
        }
        guard token.issuedAt <= now else { throw ProtocolError.notYetValid }
        guard token.expiresAt > now else { throw ProtocolError.expired }
        return token
    }

    private func verifyPayload<T: Decodable>(
        _ payload: String,
        signature: String,
        keyID: String
    ) throws -> T {
        guard let payloadData = Data(base64Encoded: payload),
              let signatureData = Data(base64Encoded: signature) else {
            throw ProtocolError.malformedEnvelope
        }
        guard let key = keys[keyID] else { throw ProtocolError.unknownKey }
        guard key.isValidSignature(signatureData, for: payloadData) else {
            throw ProtocolError.invalidSignature
        }
        return try CanonicalJSON.decodeCanonical(T.self, from: payloadData)
    }
}
