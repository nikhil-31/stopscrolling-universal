import BlockingCore
import Foundation
import NetworkExtension

public final class FilterDataProvider: NEFilterDataProvider {
    private let policyURL = FileManager.default
        .containerURL(forSecurityApplicationGroupIdentifier:
            Bundle.main.object(forInfoDictionaryKey: "StopScrollingAppGroupIdentifier") as! String)!
        .appendingPathComponent("active-policy.json")

    public override func startFilter(completionHandler: @escaping (Error?) -> Void) {
        completionHandler(nil)
    }

    public override func handleNewFlow(_ flow: NEFilterFlow) -> NEFilterNewFlowVerdict {
        guard let host = hostname(for: flow),
              activeOccurrences().contains(where: { occurrence in
                  occurrence.domains.contains { Matchers.domain(host, matches: $0) }
              }) else {
            return .allow()
        }
        return .drop()
    }

    private func hostname(for flow: NEFilterFlow) -> String? {
        if let socketFlow = flow as? NEFilterSocketFlow {
            return socketFlow.remoteHostname
        }
        return nil
    }

    private func activeOccurrences() -> [BlockingOccurrence] {
        guard let data = try? Data(contentsOf: policyURL),
              let snapshot = try? JSONDecoder().decode(ActivePolicySnapshot.self, from: data) else {
            return []
        }
        return snapshot.stillActiveOccurrences(currentUptime: ProcessInfo.processInfo.systemUptime)
    }
}
