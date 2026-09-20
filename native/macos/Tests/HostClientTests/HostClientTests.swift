import Testing
@testable import HostClient

@Test func hostClientExportsInProcessActivationEntryPoints() {
    #expect(HostActivation.networkFilterIdentifier == "com.stopscrolling.desktop.network-filter")
    #expect(HostActivation.endpointSecurityIdentifier == "com.stopscrolling.desktop.endpoint-security")
    #expect(HostXPCClient.serviceName == "com.stopscrolling.helper")
}
