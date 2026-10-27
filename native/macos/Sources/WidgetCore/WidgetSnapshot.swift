import Foundation

public let widgetEmptyCopy = "No tracked time in this period."

/// Opens the desktop app when a widget is clicked.
public let widgetOpenURL = URL(string: "stopscrolling://open")!

public struct WidgetApp: Codable, Sendable, Equatable, Identifiable {
    public var key: String
    public var label: String
    public var seconds: Double

    public var id: String { key }

    public init(key: String, label: String, seconds: Double) {
        self.key = key
        self.label = label
        self.seconds = seconds
    }
}

/// Totals already summed by the desktop app. This type does not classify time.
public struct WidgetSnapshot: Codable, Sendable, Equatable {
    public var productiveSeconds: Double
    public var neutralSeconds: Double
    public var distractingSeconds: Double
    public var unratedSeconds: Double
    public var top: [WidgetApp]

    public init(
        productiveSeconds: Double,
        neutralSeconds: Double,
        distractingSeconds: Double,
        unratedSeconds: Double,
        top: [WidgetApp]
    ) {
        self.productiveSeconds = productiveSeconds
        self.neutralSeconds = neutralSeconds
        self.distractingSeconds = distractingSeconds
        self.unratedSeconds = unratedSeconds
        self.top = top
    }

    public static let empty = WidgetSnapshot(
        productiveSeconds: 0,
        neutralSeconds: 0,
        distractingSeconds: 0,
        unratedSeconds: 0,
        top: []
    )

    public var apps: [WidgetApp] { Array(top.prefix(5)) }

    public var verdicts: [WidgetVerdict] {
        var rows = [
            WidgetVerdict(label: "Productive", seconds: productiveSeconds),
            WidgetVerdict(label: "Neutral", seconds: neutralSeconds),
            WidgetVerdict(label: "Distracting", seconds: distractingSeconds),
        ]
        if unratedSeconds > 0 {
            rows.append(WidgetVerdict(label: "Unrated", seconds: unratedSeconds))
        }
        return rows
    }

    public var isEmpty: Bool {
        productiveSeconds <= 0 && neutralSeconds <= 0 && distractingSeconds <= 0 && unratedSeconds <= 0 && top.isEmpty
    }

    public var trackedSeconds: Double {
        productiveSeconds + neutralSeconds + distractingSeconds + unratedSeconds
    }

    public static func decode(_ data: Data) throws -> WidgetSnapshot {
        try JSONDecoder().decode(WidgetSnapshot.self, from: data)
    }
}

public struct WidgetVerdict: Sendable, Equatable, Identifiable {
    public var label: String
    public var seconds: Double

    public var id: String { label }

    public init(label: String, seconds: Double) {
        self.label = label
        self.seconds = seconds
    }
}

public enum WidgetStore {
    public static let groupIdentifier = "group.com.stopscrolling.desktop"
    public static let fileName = "widget.json"
    public static let kind = "StopScrollingTime"

    public static func load(from data: Data?) -> WidgetSnapshot {
        guard let data, let snapshot = try? WidgetSnapshot.decode(data) else { return .empty }
        return snapshot
    }

    public static func loadFromGroup() -> WidgetSnapshot {
        if let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupIdentifier),
           let snapshot = read(container.appendingPathComponent(fileName)) {
            return snapshot
        }
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
        if let support, let snapshot = read(support.appendingPathComponent(fileName)) {
            return snapshot
        }
        return .empty
    }

    private static func read(_ url: URL) -> WidgetSnapshot? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? WidgetSnapshot.decode(data)
    }
}

public func usagePercentLabel(seconds: Double, total: Double) -> String {
    guard total > 0, seconds > 0 else { return "0%" }
    let percent = Int((seconds / total * 100).rounded())
    if percent < 1 { return "<1%" }
    return "\(min(percent, 100))%"
}

/// Bar fill for an app row. Tiny shares still show a sliver, matching the app list.
public func usageBarFraction(seconds: Double, total: Double) -> Double {
    guard total > 0, seconds > 0 else { return 0 }
    return min(1, max(0.03, seconds / total))
}

public func formatTrackedDuration(_ seconds: Double) -> String {
    let safe = max(0, Int(seconds.rounded()))
    if safe < 60 { return "\(safe)s" }
    let hours = safe / 3600
    let minutes = (safe % 3600) / 60
    if hours <= 0 { return "\(minutes)m" }
    if minutes <= 0 { return "\(hours)h" }
    return "\(hours)h \(minutes)m"
}
