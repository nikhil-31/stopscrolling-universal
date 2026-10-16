import BlockingCore
import Darwin
import Foundation
import Network
import NetworkExtension

public final class FilterDataProvider: NEFilterDataProvider {
    private let addresses = BlockedAddressMemory()
    private let policyURL = FileManager.default
        .containerURL(forSecurityApplicationGroupIdentifier:
            Bundle.main.object(forInfoDictionaryKey: "StopScrollingAppGroupIdentifier") as! String)!
        .appendingPathComponent("active-policy.json")

    public override func startFilter(completionHandler: @escaping (Error?) -> Void) {
        completionHandler(nil)
    }

    public override func stopFilter(with reason: NEProviderStopReason, completionHandler: @escaping () -> Void) {
        completionHandler()
    }

    public override func handleNewFlow(_ flow: NEFilterFlow) -> NEFilterNewFlowVerdict {
        let facts = facts(from: flow, outbound: nil)
        switch FlowVerdict.decide(facts, occurrences: activeOccurrences(), addresses: addresses, now: Date()) {
        case .drop:
            return .drop()
        case .peekOutbound:
            return peek(port: facts.port)
        case .allow:
            if facts.port == FlowVerdict.dnsPort { return inspectDNS() }
            return .allow()
        }
    }

    public override func handleOutboundData(
        from flow: NEFilterFlow,
        readBytesStartOffset offset: Int,
        readBytes: Data
    ) -> NEFilterDataVerdict {
        let facts = facts(from: flow, outbound: readBytes)
        let occurrences = activeOccurrences()
        if facts.port == FlowVerdict.dnsPort {
            addresses.recordDNS(readBytes, domains: occurrences.flatMap(\.domains), now: Date())
            return NEFilterDataVerdict(passBytes: readBytes.count, peekBytes: 0)
        }
        _ = offset
        return dataVerdict(for: facts, occurrences: occurrences)
    }

    public override func handleInboundData(
        from flow: NEFilterFlow,
        readBytesStartOffset offset: Int,
        readBytes: Data
    ) -> NEFilterDataVerdict {
        _ = offset
        let facts = facts(from: flow, outbound: nil)
        if facts.port == FlowVerdict.dnsPort {
            addresses.recordDNS(readBytes, domains: activeOccurrences().flatMap(\.domains), now: Date())
        }
        return .allow()
    }

    public override func handleOutboundDataComplete(for flow: NEFilterFlow) -> NEFilterDataVerdict {
        let facts = facts(from: flow, outbound: Data())
        if facts.port == FlowVerdict.dnsPort { return .allow() }
        return dataVerdict(for: facts, occurrences: activeOccurrences())
    }

    public override func handleInboundDataComplete(for flow: NEFilterFlow) -> NEFilterDataVerdict {
        .allow()
    }

    private func dataVerdict(for facts: FlowFacts, occurrences: [BlockingOccurrence]) -> NEFilterDataVerdict {
        switch FlowVerdict.decide(facts, occurrences: occurrences, addresses: addresses, now: Date()) {
        case .drop:
            return .drop()
        case .peekOutbound:
            return NEFilterDataVerdict(passBytes: 0, peekBytes: 4_096)
        case .allow:
            return .allow()
        }
    }

    private func peek(port: UInt16) -> NEFilterNewFlowVerdict {
        let dns = port == FlowVerdict.dnsPort
        return .filterDataVerdict(
            withFilterInbound: dns,
            peekInboundBytes: dns ? 4_096 : 0,
            filterOutbound: true,
            peekOutboundBytes: 4_096
        )
    }

    private func inspectDNS() -> NEFilterNewFlowVerdict {
        .filterDataVerdict(
            withFilterInbound: true,
            peekInboundBytes: 4_096,
            filterOutbound: false,
            peekOutboundBytes: 0
        )
    }

    private func facts(from flow: NEFilterFlow, outbound: Data?) -> FlowFacts {
        var facts = FlowFacts(urlHost: flow.url?.host, port: 0, transport: .other, outbound: outbound)
        guard let socket = flow as? NEFilterSocketFlow else { return facts }
        facts.hostname = socket.remoteHostname
        facts.transport = transport(socket)
        let remote = remoteAddress(socket)
        facts.remoteAddress = remote.address
        facts.port = remote.port
        return facts
    }

    private func transport(_ flow: NEFilterSocketFlow) -> FlowTransport {
        if flow.socketType == SOCK_STREAM || flow.socketProtocol == IPPROTO_TCP { return .tcp }
        if flow.socketType == SOCK_DGRAM || flow.socketProtocol == IPPROTO_UDP { return .udp }
        return .other
    }

    private func remoteAddress(_ flow: NEFilterSocketFlow) -> (address: String?, port: UInt16) {
        guard #available(macOS 15.0, *), let endpoint = flow.remoteFlowEndpoint else { return (nil, 0) }
        guard case .hostPort(let host, let port) = endpoint else { return (nil, 0) }
        let address: String?
        switch host {
        case .ipv4(let value):
            address = "\(value)"
        case .ipv6(let value):
            address = "\(value)"
        default:
            address = nil
        }
        return (address, port.rawValue)
    }

    private func activeOccurrences() -> [BlockingOccurrence] {
        guard let data = try? Data(contentsOf: policyURL),
              let snapshot = try? JSONDecoder().decode(ActivePolicySnapshot.self, from: data) else {
            return []
        }
        return snapshot.stillActiveOccurrences(currentUptime: ProcessInfo.processInfo.systemUptime)
    }
}
