import BlockingCore
import Foundation

private let strictMarker = URL(fileURLWithPath: "/Library/Application Support/StopScrolling/strict-active")
private let extensionPolicy = FileManager.default
    .containerURL(forSecurityApplicationGroupIdentifier: requiredConfiguration("StopScrollingAppGroupIdentifier"))!
    .appendingPathComponent("active-policy.json")

func requiredConfiguration(_ key: String) -> String {
    guard let value = Bundle.main.object(forInfoDictionaryKey: key) as? String, !value.isEmpty else {
        fatalError("Missing signed helper configuration: \(key)")
    }
    return value
}

let keyID = requiredConfiguration("StopScrollingPolicyKeyID")
let publicKey = requiredConfiguration("StopScrollingPolicyPublicKey")
let verifier = try PolicyVerifier(base64PublicKeys: [keyID: publicKey])
let store = try RootPolicyStore()
let engine = EnforcementEngine(
    verifier: verifier,
    store: store,
    wallClock: SystemWallClock(),
    monotonicClock: SystemMonotonicClock(),
    sink: FileEnforcementSink(url: extensionPolicy)
)

Task {
    do {
        try await engine.restore()
    } catch {
        try? FileManager.default.removeItem(at: strictMarker)
    }

    while !Task.isCancelled {
        await engine.tick()
        if await engine.hasActiveStrictOccurrence() {
            FileManager.default.createFile(atPath: strictMarker.path, contents: Data())
            try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: strictMarker.path)
        } else {
            try? FileManager.default.removeItem(at: strictMarker)
        }
        try? await Task.sleep(for: .seconds(1))
    }
}

let authenticator = try ClientAuthenticator(
    teamIdentifier: requiredConfiguration("StopScrollingTeamIdentifier"),
    signingIdentifier: requiredConfiguration("StopScrollingClientSigningIdentifier")
)
let delegate = HelperDelegate(service: HelperService(engine: engine), authenticator: authenticator)
let listener = NSXPCListener(machServiceName: "com.stopscrolling.helper")
listener.delegate = delegate
listener.resume()
RunLoop.main.run()
