import Foundation
import HelperXPC

enum HostClientError: String, Error {
    case disconnected = "helper-disconnected"
    case malformedRequest = "malformed-helper-request"
    case xpcFailed = "xpc-failed"
}

final class HostXPCClient: @unchecked Sendable {
    static let shared = HostXPCClient()
    static let serviceName = "com.stopscrolling.helper"

    private let queue = DispatchQueue(label: "com.stopscrolling.hostclient.xpc")
    private var connection: NSXPCConnection?

    func close() {
        queue.sync {
            connection?.invalidate()
            connection = nil
        }
    }

    func request(operation: String, body: Data?) throws -> Data {
        try queue.sync {
            let connection = try connected()
            let box = ReplyBox()
            let proxy = connection.remoteObjectProxyWithErrorHandler { error in
                box.finish(data: nil, error: error)
            } as? StopScrollingHelperXPC
            guard let proxy else { throw HostClientError.disconnected }
            return try submit(operation: operation, body: body, proxy: proxy, box: box)
        }
    }

    private func connected() throws -> NSXPCConnection {
        if let connection {
            return connection
        }
        let connection = NSXPCConnection(machServiceName: Self.serviceName, options: .privileged)
        connection.remoteObjectInterface = NSXPCInterface(with: StopScrollingHelperXPC.self)
        let queue = self.queue
        connection.invalidationHandler = { [weak self] in
            guard let self else { return }
            queue.async { self.connection = nil }
        }
        connection.interruptionHandler = { [weak self] in
            guard let self else { return }
            queue.async {
                self.connection?.invalidate()
                self.connection = nil
            }
        }
        connection.resume()
        self.connection = connection
        return connection
    }

    private func submit(operation: String, body: Data?, proxy: StopScrollingHelperXPC, box: ReplyBox) throws -> Data {
        let finish: @Sendable (Data?, Error?) -> Void = { data, error in
            box.finish(data: data, error: error)
        }

        switch operation {
        case "applyPolicy":
            guard let body else { throw HostClientError.malformedRequest }
            proxy.applyPolicy(body, reply: finish)
        case "status":
            proxy.status(reply: finish)
        case "redeemBypass":
            guard let body else { throw HostClientError.malformedRequest }
            proxy.redeemBypass(body, reply: finish)
        case "inventory":
            proxy.inventory(reply: finish)
        case "cancelNormal":
            guard let occurrenceID = body.flatMap({ String(data: $0, encoding: .utf8) }), !occurrenceID.isEmpty else {
                throw HostClientError.malformedRequest
            }
            proxy.cancelNormal(occurrenceID) { error in
                finish(Data("{}".utf8), error)
            }
        default:
            throw HostClientError.malformedRequest
        }

        if box.semaphore.wait(timeout: .now() + 15) == .timedOut {
            throw HostClientError.disconnected
        }
        if let replyError = box.error { throw replyError }
        return box.data ?? Data()
    }
}

private final class ReplyBox: @unchecked Sendable {
    private let lock = NSLock()
    private var completed = false
    var data: Data?
    var error: Error?
    let semaphore = DispatchSemaphore(value: 0)

    func finish(data: Data?, error: Error?) {
        lock.lock()
        defer { lock.unlock() }
        guard !completed else { return }
        completed = true
        self.data = data
        self.error = error
        semaphore.signal()
    }
}
