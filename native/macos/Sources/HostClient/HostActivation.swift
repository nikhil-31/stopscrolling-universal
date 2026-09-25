import Foundation
import NetworkExtension
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
    case networkFilterActivationFailed = "network-filter-activation-failed"
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
        status.networkFilterApproved = NEFilterManager.shared().isEnabled
        status.endpointSecurityApproved = endpointSecurityApproved
        return status
    }

    func activate() -> HostSetupStatus {
        let helperError = capture { try registerHelper() }
        let networkError = capture {
            try activateExtension(Self.networkFilterIdentifier)
            try enableNetworkFilter()
        }
        let endpointError = capture {
            try activateExtension(Self.endpointSecurityIdentifier)
            endpointSecurityApproved = true
        }
        var status = currentSetup()
        let registrationError = status.helperRegistered
            ? nil
            : (helperError ?? "helper-not-enabled")
        status.lastError = registrationError ?? networkError ?? endpointError
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
        if service.status == .enabled { return }
        do {
            try service.register()
        } catch {
            let nsError = error as NSError
            throw HelperRegistrationFailure(detail: "helper-registration-failed \(nsError.domain) \(nsError.code)")
        }
        if service.status != .enabled {
            throw HostActivationError.userApprovalRequired
        }
    }

    private func enableNetworkFilter() throws {
        let loadBox = PreferenceBox()
        let manager = NEFilterManager.shared()
        manager.loadFromPreferences { error in
            loadBox.error = error
            loadBox.semaphore.signal()
        }
        _ = loadBox.semaphore.wait(timeout: .now() + 15)
        if loadBox.error != nil { throw HostActivationError.networkFilterActivationFailed }

        if manager.providerConfiguration == nil {
            let configuration = NEFilterProviderConfiguration()
            configuration.filterSockets = true
            manager.providerConfiguration = configuration
        }
        manager.isEnabled = true

        let saveBox = PreferenceBox()
        manager.saveToPreferences { error in
            saveBox.error = error
            saveBox.semaphore.signal()
        }
        _ = saveBox.semaphore.wait(timeout: .now() + 15)
        if saveBox.error != nil || !manager.isEnabled {
            throw HostActivationError.networkFilterActivationFailed
        }
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

private final class PreferenceBox: @unchecked Sendable {
    var error: Error?
    let semaphore = DispatchSemaphore(value: 0)
}
