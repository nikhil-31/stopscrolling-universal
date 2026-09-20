import BlockingCore
import Foundation
import HelperXPC
import Security

final class ClientAuthenticator {
    private let requirement: SecRequirement

    init(teamIdentifier: String, signingIdentifier: String) throws {
        let expression = """
        anchor apple generic and certificate leaf[subject.OU] = "\(teamIdentifier)" \
        and identifier "\(signingIdentifier)"
        """
        var value: SecRequirement?
        let status = SecRequirementCreateWithString(expression as CFString, [], &value)
        guard status == errSecSuccess, let value else { throw ProtocolError.unauthorizedClient }
        requirement = value
    }

    func accepts(_ connection: NSXPCConnection) -> Bool {
        // NSXPCConnection does not expose its audit token in the public Swift
        // SDK. Resolve the already-connected peer PID to a SecCode object and
        // validate the full designated requirement before exporting methods.
        let attributes = [
            kSecGuestAttributePid: NSNumber(value: connection.processIdentifier),
        ] as CFDictionary
        var code: SecCode?
        guard SecCodeCopyGuestWithAttributes(nil, attributes, [], &code) == errSecSuccess,
              let code else { return false }
        return SecCodeCheckValidity(code, [], requirement) == errSecSuccess
    }
}

final class HelperService: NSObject, StopScrollingHelperXPC, @unchecked Sendable {
    private let engine: EnforcementEngine

    init(engine: EnforcementEngine) {
        self.engine = engine
    }

    func applyPolicy(_ envelope: Data, reply: @escaping @Sendable (Data?, Error?) -> Void) {
        Task {
            do {
                try await engine.apply(JSONDecoder().decode(SignedPolicy.self, from: envelope))
                reply(try JSONEncoder().encode(await engine.status()), nil)
            } catch {
                reply(nil, error)
            }
        }
    }

    func status(reply: @escaping @Sendable (Data?, Error?) -> Void) {
        Task {
            do { reply(try JSONEncoder().encode(await engine.status()), nil) }
            catch { reply(nil, error) }
        }
    }

    func redeemBypass(_ envelope: Data, reply: @escaping @Sendable (Data?, Error?) -> Void) {
        Task {
            do {
                try await engine.redeem(JSONDecoder().decode(SignedBypassToken.self, from: envelope))
                reply(try JSONEncoder().encode(await engine.status()), nil)
            } catch {
                reply(nil, error)
            }
        }
    }

    func inventory(reply: @escaping @Sendable (Data?, Error?) -> Void) {
        Task.detached {
            do { reply(try JSONEncoder().encode(ApplicationInventory.discover()), nil) }
            catch { reply(nil, error) }
        }
    }

    func cancelNormal(_ occurrenceID: String, reply: @escaping @Sendable (Error?) -> Void) {
        Task {
            guard let id = UUID(uuidString: occurrenceID) else {
                reply(ProtocolError.malformedEnvelope)
                return
            }
            do {
                try await engine.cancelNormal(occurrenceID: id)
                reply(nil)
            } catch {
                reply(error)
            }
        }
    }
}

final class HelperDelegate: NSObject, NSXPCListenerDelegate {
    private let service: HelperService
    private let authenticator: ClientAuthenticator

    init(service: HelperService, authenticator: ClientAuthenticator) {
        self.service = service
        self.authenticator = authenticator
    }

    func listener(_ listener: NSXPCListener, shouldAcceptNewConnection connection: NSXPCConnection) -> Bool {
        guard authenticator.accepts(connection) else { return false }
        connection.exportedInterface = NSXPCInterface(with: StopScrollingHelperXPC.self)
        connection.exportedObject = service
        connection.resume()
        return true
    }
}
