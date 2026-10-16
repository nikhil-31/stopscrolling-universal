import Foundation
import ServiceManagement
import SystemExtensions

struct HostSetupStatus: Codable, Sendable {
    var helperRegistered: Bool
    var networkFilterApproved: Bool
    var endpointSecurityApproved: Bool
    var lastError: String?

    static let empty = HostSetupStatus(
        helperRegistered: false,
        networkFilterApproved: false,
        endpointSecurityApproved: false,
        lastError: nil
    )
}

struct HelperRegistrationFailure: Error {
    var detail: String
}

enum HostActivationError: String, Error {
    case helperRegistrationFailed = "helper-registration-failed"
    case endpointSecurityActivationFailed = "endpoint-security-activation-failed"
    case userApprovalRequired = "activation-requires-user-approval"
}

final class HostActivation: NSObject, OSSystemExtensionRequestDelegate, @unchecked Sendable {
    static let shared = HostActivation()
    static let helperPlistName = "com.stopscrolling.helper.plist"
    static let networkFilterIdentifier = "com.stopscrolling.desktop.network-filter"
    static let endpointSecurityIdentifier = "com.stopscrolling.desktop.endpoint-security"

    private let queue = DispatchQueue(label: "com.stopscrolling.hostclient.activation")
    private var inFlight: (identifier: String, finish: (Result<Void, Error>) -> Void)?
    private var endpointSecurityApproved = false

    func currentSetup() -> HostSetupStatus {
        var status = HostSetupStatus.empty
        status.helperRegistered = SMAppService.daemon(plistName: Self.helperPlistName).status == .enabled
        status.networkFilterApproved = false
        status.endpointSecurityApproved = endpointSecurityApproved
        return status
    }

    func activate() -> HostSetupStatus {
        let helperError = capture { try registerHelper() }
        let endpointError = capture {
            try activateExtension(Self.endpointSecurityIdentifier)
            endpointSecurityApproved = true
        }
        var status = currentSetup()
        let registrationError = status.helperRegistered
            ? nil
            : (helperError ?? "helper-not-enabled")
        status.lastError = registrationError ?? endpointError
        return status
    }

    private func capture(_ body: () throws -> Void) -> String? {
        do {
            try body()
            return nil
        } catch let error as HostActivationError {
            return error.rawValue
        } catch let error as HelperRegistrationFailure {
            return error.detail
        } catch {
            return mappedActivationError(error)
        }
    }

    private func registerHelper() throws {
        let service = SMAppService.daemon(plistName: Self.helperPlistName)
        if service.status == .enabled, HostXPCClient.shared.isReachable() {
            return
        }
        HostXPCClient.shared.close()
        // A replaced helper keeps the previous launchd code requirement until the daemon
        // is unregistered. register() then returns "already registered" and launchd
        // refuses to spawn the new binary.
        if service.status == .enabled {
            unregisterHelper(service)
        }
        do {
            try service.register()
        } catch {
            let nsError = error as NSError
            if service.status != .enabled {
                throw HelperRegistrationFailure(detail: "helper-registration-failed \(nsError.domain) \(nsError.code)")
            }
        }
        if service.status != .enabled {
            throw HostActivationError.userApprovalRequired
        }
    }

    private func unregisterHelper(_ service: SMAppService) {
        let box = DispatchSemaphore(value: 0)
        service.unregister { _ in
            box.signal()
        }
        _ = box.wait(timeout: .now() + 5)
    }

    private func activateExtension(_ identifier: String) throws {
        let semaphore = DispatchSemaphore(value: 0)
        var result: Result<Void, Error> = .failure(HostActivationError.userApprovalRequired)
        queue.sync {
            inFlight = (identifier, { outcome in
                result = outcome
                semaphore.signal()
            })
        }
        let request = OSSystemExtensionRequest.activationRequest(
            forExtensionWithIdentifier: identifier,
            queue: queue
        )
        request.delegate = self
        OSSystemExtensionManager.shared.submitRequest(request)
        if semaphore.wait(timeout: .now() + 60) == .timedOut {
            throw HostActivationError.userApprovalRequired
        }
        try result.get()
    }

    private func mappedActivationError(_ error: Error) -> String {
        let nsError = error as NSError
        if nsError.domain == OSSystemExtensionErrorDomain {
            return HostActivationError.userApprovalRequired.rawValue
        }
        if let activationError = error as? HostActivationError {
            return activationError.rawValue
        }
        return "activation-failed"
    }

    func request(
        _ request: OSSystemExtensionRequest,
        didFinishWithResult result: OSSystemExtensionRequest.Result
    ) {
        finish(request, .success(()))
        _ = result
    }

    func request(_ request: OSSystemExtensionRequest, didFailWithError error: Error) {
        finish(request, .failure(error))
    }

    func requestNeedsUserApproval(_ request: OSSystemExtensionRequest) {
        finish(request, .failure(HostActivationError.userApprovalRequired))
    }

    func request(
        _ request: OSSystemExtensionRequest,
        actionForReplacingExtension existing: OSSystemExtensionProperties,
        withExtension ext: OSSystemExtensionProperties
    ) -> OSSystemExtensionRequest.ReplacementAction {
        _ = existing
        _ = ext
        return .replace
    }

    private func finish(_ request: OSSystemExtensionRequest, _ outcome: Result<Void, Error>) {
        guard let inFlight, inFlight.identifier == request.identifier else { return }
        let finish = inFlight.finish
        self.inFlight = nil
        finish(outcome)
    }
}
