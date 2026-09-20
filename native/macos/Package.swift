// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "StopScrollingMac",
    platforms: [.macOS(.v13)],
    products: [
        .library(name: "BlockingCore", targets: ["BlockingCore"]),
        .library(name: "HelperXPC", targets: ["HelperXPC"]),
        .library(name: "StopScrollingHostClient", type: .dynamic, targets: ["HostClient"]),
        .executable(name: "StopScrollingHelper", targets: ["PrivilegedHelper"]),
        .library(name: "StopScrollingNetworkFilter", targets: ["NetworkFilterExtension"]),
        .executable(name: "StopScrollingEndpointSecurity", targets: ["EndpointSecurityExtension"]),
    ],
    targets: [
        .target(name: "BlockingCore"),
        .target(name: "HelperXPC"),
        .target(
            name: "HostClient",
            dependencies: ["HelperXPC"],
            linkerSettings: [
                .linkedFramework("ServiceManagement"),
                .linkedFramework("SystemExtensions"),
                .linkedFramework("NetworkExtension"),
            ]
        ),
        .executableTarget(
            name: "PrivilegedHelper",
            dependencies: ["BlockingCore", "HelperXPC"]
        ),
        .target(
            name: "NetworkFilterExtension",
            dependencies: ["BlockingCore"],
            linkerSettings: [.linkedFramework("NetworkExtension")]
        ),
        .executableTarget(
            name: "EndpointSecurityExtension",
            dependencies: ["BlockingCore"],
            linkerSettings: [
                .linkedLibrary("EndpointSecurity"),
                .linkedFramework("Security"),
            ]
        ),
        .testTarget(
            name: "BlockingCoreTests",
            dependencies: ["BlockingCore"],
            resources: [.copy("Fixtures")]
        ),
        .testTarget(
            name: "HostClientTests",
            dependencies: ["HostClient"]
        ),
    ]
)
