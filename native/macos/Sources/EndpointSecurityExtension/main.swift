import BlockingCore
import EndpointSecurity
import Foundation

private let policyURL = FileManager.default
    .containerURL(forSecurityApplicationGroupIdentifier:
        Bundle.main.object(forInfoDictionaryKey: "StopScrollingAppGroupIdentifier") as! String)!
    .appendingPathComponent("active-policy.json")

private func string(_ token: es_string_token_t) -> String? {
    guard token.length > 0 else { return nil }
    let bytes = UnsafeRawBufferPointer(start: token.data, count: token.length)
    return String(decoding: bytes, as: UTF8.self)
}

private func activeApplications() -> [AppIdentity] {
    guard let data = try? Data(contentsOf: policyURL),
          let snapshot = try? JSONDecoder().decode(ActivePolicySnapshot.self, from: data) else {
        return []
    }
    return snapshot
        .stillActiveOccurrences(currentUptime: ProcessInfo.processInfo.systemUptime)
        .flatMap(\.applications)
}

private func bundleIdentifier(containing executablePath: String) -> String? {
    var url = URL(fileURLWithPath: executablePath).deletingLastPathComponent()
    while url.path != "/" {
        if url.pathExtension == "app" { return Bundle(url: url)?.bundleIdentifier }
        url.deleteLastPathComponent()
    }
    return nil
}

private func shouldDeny(_ process: es_process_t) -> Bool {
    let path = string(process.executable.pointee.path) ?? ""
    let signingID = string(process.signing_id)
    let bundleID = bundleIdentifier(containing: path)
    return activeApplications().contains {
        Matchers.application(
            signingIdentifier: signingID,
            bundleIdentifier: bundleID,
            executablePath: path,
            matches: $0
        )
    }
}

var client: OpaquePointer?
let result = es_new_client(&client) { client, message in
    guard message.pointee.action_type == ES_ACTION_TYPE_AUTH else { return }
    let target = message.pointee.event.exec.target.pointee
    let decision = shouldDeny(target) ? ES_AUTH_RESULT_DENY : ES_AUTH_RESULT_ALLOW
    es_respond_auth_result(client, message, decision, false)
}

guard result == ES_NEW_CLIENT_RESULT_SUCCESS, let client else {
    fatalError("Endpoint Security client activation failed: \(result.rawValue)")
}

var events = [ES_EVENT_TYPE_AUTH_EXEC]
guard es_subscribe(client, &events, UInt32(events.count)) == ES_RETURN_SUCCESS else {
    fatalError("Endpoint Security AUTH_EXEC subscription failed")
}

dispatchMain()
