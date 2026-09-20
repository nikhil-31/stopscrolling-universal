import AppKit
import Foundation
import Security

public enum ApplicationInventory {
    public static func discover(
        roots: [URL] = [
            URL(fileURLWithPath: "/Applications"),
            URL(fileURLWithPath: "/System/Applications"),
            FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Applications"),
        ]
    ) -> [InstalledApplication] {
        let keys: [URLResourceKey] = [.isDirectoryKey, .isApplicationKey]
        var applications: [InstalledApplication] = []

        for root in roots {
            guard let enumerator = FileManager.default.enumerator(
                at: root,
                includingPropertiesForKeys: keys,
                options: [.skipsHiddenFiles, .skipsPackageDescendants]
            ) else { continue }

            for case let url as URL in enumerator where url.pathExtension.lowercased() == "app" {
                guard let bundle = Bundle(url: url),
                      let executable = bundle.executableURL else { continue }
                applications.append(
                    InstalledApplication(
                        displayName: bundle.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String
                            ?? bundle.object(forInfoDictionaryKey: "CFBundleName") as? String
                            ?? url.deletingPathExtension().lastPathComponent,
                        bundleIdentifier: bundle.bundleIdentifier,
                        signingIdentifier: signingIdentifier(for: url),
                        executablePath: executable.standardizedFileURL.path
                    )
                )
            }
        }

        return Dictionary(grouping: applications, by: \.executablePath)
            .compactMap { $0.value.first }
            .sorted { $0.displayName.localizedCaseInsensitiveCompare($1.displayName) == .orderedAscending }
    }

    private static func signingIdentifier(for applicationURL: URL) -> String? {
        var staticCode: SecStaticCode?
        guard SecStaticCodeCreateWithPath(applicationURL as CFURL, [], &staticCode) == errSecSuccess,
              let staticCode else { return nil }
        var information: CFDictionary?
        guard SecCodeCopySigningInformation(staticCode, [], &information) == errSecSuccess,
              let dictionary = information as? [String: Any] else { return nil }
        return dictionary[kSecCodeInfoIdentifier as String] as? String
    }
}
