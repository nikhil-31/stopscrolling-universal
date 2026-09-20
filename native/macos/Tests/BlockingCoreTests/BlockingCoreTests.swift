import CryptoKit
import Foundation
import Testing
@testable import BlockingCore

private final class TestWallClock: WallClock, @unchecked Sendable {
    var value: Int64
    init(_ value: Int64) { self.value = value }
    func now() -> Int64 { value }
}

private final class TestMonotonicClock: MonotonicClock, @unchecked Sendable {
    var value: TimeInterval
    init(_ value: TimeInterval) { self.value = value }
    func uptime() -> TimeInterval { value }
}

private actor RecordingSink: EnforcementSink {
    var snapshots: [ActivePolicySnapshot] = []
    func apply(_ snapshot: ActivePolicySnapshot) { snapshots.append(snapshot) }
}

private struct Fixture {
    let privateKey = Curve25519.Signing.PrivateKey()
    let deviceID = UUID()
    let occurrenceID = UUID()

    var verifier: PolicyVerifier {
        try! PolicyVerifier(base64PublicKeys: [
            "test": privateKey.publicKey.rawRepresentation.base64EncodedString(),
        ])
    }

    func policy(version: UInt64 = 1, mode: BlockingMode = .strict) -> BlockingPolicy {
        BlockingPolicy(
            policyVersion: version,
            deviceID: deviceID,
            issuedAt: 900,
            expiresAt: 2_000,
            occurrences: [
                BlockingOccurrence(
                    id: occurrenceID,
                    startsAt: 1_000,
                    endsAt: 1_100,
                    mode: mode,
                    domains: ["example.com"],
                    applications: [AppIdentity(signingIdentifier: "com.example.app")]
                ),
            ]
        )
    }

    func sign(_ policy: BlockingPolicy) throws -> SignedPolicy {
        let payload = try CanonicalJSON.encode(policy)
        return SignedPolicy(
            payload: payload.base64EncodedString(),
            signature: try privateKey.signature(for: payload).base64EncodedString(),
            keyID: "test"
        )
    }

    func bypass(nonce: String = "nonce-1") throws -> SignedBypassToken {
        let token = BypassToken(
            occurrenceID: occurrenceID,
            deviceID: deviceID,
            nonce: nonce,
            issuedAt: 1_000,
            expiresAt: 1_050
        )
        let payload = try CanonicalJSON.encode(token)
        return SignedBypassToken(
            payload: payload.base64EncodedString(),
            signature: try privateKey.signature(for: payload).base64EncodedString(),
            keyID: "test"
        )
    }
}

private struct GoldenContract: Decodable {
    let publicKey: String
    let payload: String
    let signature: String
    let keyID: String

    enum CodingKeys: String, CodingKey {
        case publicKey = "public_key"
        case payload, signature, keyID
    }
}

private func temporaryStore() throws -> RootPolicyStore {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    return try RootPolicyStore(url: directory.appendingPathComponent("state.json"))
}

@Test func exactDomainAndSubdomainsMatchWithoutSuffixConfusion() {
    #expect(Matchers.domain("example.com", matches: "example.com"))
    #expect(Matchers.domain("WWW.Example.com.", matches: "example.com"))
    #expect(Matchers.domain("deep.www.example.com", matches: "example.com"))
    #expect(!Matchers.domain("notexample.com", matches: "example.com"))
    #expect(!Matchers.domain("example.com.evil.test", matches: "example.com"))
}

@Test func applicationMatchesStableIdentifiersOrExactStandardizedPath() {
    #expect(Matchers.application(
        signingIdentifier: "com.example.app",
        bundleIdentifier: nil,
        executablePath: "/Applications/App.app/Contents/MacOS/App",
        matches: AppIdentity(signingIdentifier: "com.example.app")
    ))
    #expect(Matchers.application(
        signingIdentifier: nil,
        bundleIdentifier: "com.example.bundle",
        executablePath: "/x",
        matches: AppIdentity(bundleIdentifier: "com.example.bundle")
    ))
    #expect(!Matchers.application(
        signingIdentifier: "com.example.other",
        bundleIdentifier: nil,
        executablePath: "/Applications/Other",
        matches: AppIdentity(signingIdentifier: "com.example.app")
    ))
}

@Test func verifiesCanonicalSignedPolicyAndRejectsNonCanonicalJSON() throws {
    let fixture = Fixture()
    let policy = fixture.policy()
    let signed = try fixture.sign(policy)
    #expect(try fixture.verifier.verify(signed, now: 1_000) == policy)

    let canonical = try CanonicalJSON.encode(policy)
    let object = try JSONSerialization.jsonObject(with: canonical) as! [String: Any]
    let nonCanonical = try JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted])
    let malformed = SignedPolicy(
        payload: nonCanonical.base64EncodedString(),
        signature: try fixture.privateKey.signature(for: nonCanonical).base64EncodedString(),
        keyID: "test"
    )
    #expect(throws: ProtocolError.nonCanonicalPayload) {
        try fixture.verifier.verify(malformed, now: 1_000)
    }
}

@Test func verifiesBackendGeneratedGoldenContract() throws {
    let url = try #require(Bundle.module.url(
        forResource: "backend-contract-v1",
        withExtension: "json",
        subdirectory: "Fixtures"
    ))
    let fixture = try JSONDecoder().decode(GoldenContract.self, from: Data(contentsOf: url))
    let base64Key = fixture.publicKey
        .replacingOccurrences(of: "-", with: "+")
        .replacingOccurrences(of: "_", with: "/") + "="
    let verifier = try PolicyVerifier(base64PublicKeys: [fixture.keyID: base64Key])
    let policy = try verifier.verify(
        SignedPolicy(
            payload: fixture.payload,
            signature: fixture.signature,
            keyID: fixture.keyID
        ),
        now: 1_789_381_800
    )
    #expect(policy.policyVersion == 1_789_379_400_000_000)
    #expect(policy.occurrences.first?.domains == ["example.com"])
}

@Test func expiredPolicyIsRejected() throws {
    let fixture = Fixture()
    let signed = try fixture.sign(fixture.policy())
    #expect(throws: ProtocolError.expired) {
        try fixture.verifier.verify(signed, now: 2_000)
    }
}

@Test func stalePolicyAndNonceReplayPersist() async throws {
    let fixture = Fixture()
    let store = try temporaryStore()
    let envelope = try fixture.sign(fixture.policy())
    try await store.accept(policy: envelope, version: 1)
    await #expect(throws: ProtocolError.stalePolicy) {
        try await store.accept(policy: envelope, version: 1)
    }
    try await store.consume(nonce: "same", expiresAt: 2_000, now: 1_000)
    await #expect(throws: ProtocolError.replayedNonce) {
        try await store.consume(nonce: "same", expiresAt: 2_000, now: 1_001)
    }
}

@Test func strictUsesMonotonicDeadlineWhileNormalCanCancel() async throws {
    let fixture = Fixture()
    let wall = TestWallClock(1_000)
    let uptime = TestMonotonicClock(500)
    let strictEngine = EnforcementEngine(
        verifier: fixture.verifier,
        store: try temporaryStore(),
        wallClock: wall,
        monotonicClock: uptime,
        sink: RecordingSink(),
        deviceID: fixture.deviceID
    )
    try await strictEngine.apply(fixture.sign(fixture.policy(mode: .strict)))
    #expect(await strictEngine.hasActiveStrictOccurrence())

    wall.value = 100 // wall-clock rollback cannot extend or cancel the deadline
    uptime.value = 601
    #expect(!(await strictEngine.hasActiveStrictOccurrence()))

    wall.value = 1_000
    uptime.value = 700
    let normalEngine = EnforcementEngine(
        verifier: fixture.verifier,
        store: try temporaryStore(),
        wallClock: wall,
        monotonicClock: uptime,
        sink: RecordingSink(),
        deviceID: fixture.deviceID
    )
    try await normalEngine.apply(fixture.sign(fixture.policy(mode: .normal)))
    #expect((await normalEngine.activeOccurrences()).count == 1)
    try await normalEngine.cancelNormal(occurrenceID: fixture.occurrenceID)
    #expect((await normalEngine.activeOccurrences()).isEmpty)
}

@Test func signedBypassRedeemsOnceAndStopsOccurrence() async throws {
    let fixture = Fixture()
    let engine = EnforcementEngine(
        verifier: fixture.verifier,
        store: try temporaryStore(),
        wallClock: TestWallClock(1_000),
        monotonicClock: TestMonotonicClock(500),
        sink: RecordingSink(),
        deviceID: fixture.deviceID
    )
    try await engine.apply(fixture.sign(fixture.policy()))
    let token = try fixture.bypass()
    try await engine.redeem(token)
    #expect((await engine.activeOccurrences()).isEmpty)
    await #expect(throws: ProtocolError.replayedNonce) {
        try await engine.redeem(token)
    }
}

@Test func acceptsRfc3339TimestampsWithAndWithoutFractionalSeconds() throws {
    let whole = try ContractTimestamp.decode("2026-09-14T10:00:00Z")
    let fractional = try ContractTimestamp.decode("2026-09-14T10:00:00.000Z")
    #expect(whole == fractional)
    #expect(ContractTimestamp.encode(whole) == "2026-09-14T10:00:00Z")
}

@Test func bindsDeviceIDFromVerifiedPolicyAndRejectsMismatchedDevice() async throws {
    let fixture = Fixture()
    let engine = EnforcementEngine(
        verifier: fixture.verifier,
        store: try temporaryStore(),
        wallClock: TestWallClock(1_000),
        monotonicClock: TestMonotonicClock(500),
        sink: RecordingSink()
    )
    try await engine.apply(fixture.sign(fixture.policy()))
    #expect(await engine.status().policyVersion == 1)

    let mismatched = BlockingPolicy(
        policyVersion: 2,
        deviceID: UUID(),
        issuedAt: 900,
        expiresAt: 2_000,
        occurrences: fixture.policy().occurrences
    )
    await #expect(throws: ProtocolError.wrongDevice) {
        try await engine.apply(fixture.sign(mismatched))
    }
}

@Test func snapshotRejectsOldBootAndExpiresMonotonically() {
    let occurrence = Fixture().policy().occurrences[0]
    let snapshot = ActivePolicySnapshot(
        policyVersion: 1,
        generatedAt: 1_000,
        generatedUptime: 500,
        activeOccurrences: [occurrence]
    )
    #expect(snapshot.stillActiveOccurrences(currentUptime: 499).isEmpty)
    #expect(snapshot.stillActiveOccurrences(currentUptime: 550).count == 1)
    #expect(snapshot.stillActiveOccurrences(currentUptime: 601).isEmpty)
}
