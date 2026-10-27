import Foundation

public let trendEmptyCopy = "No trend data"

public struct TrendDevice: Codable, Sendable, Equatable, Identifiable {
    public var key: String
    public var seconds: Double
    public var colorIndex: Int

    public var id: String { key }

    public init(key: String, seconds: Double, colorIndex: Int) {
        self.key = key
        self.seconds = seconds
        self.colorIndex = colorIndex
    }
}

public struct TrendBucket: Codable, Sendable, Equatable, Identifiable {
    public var id: String
    public var label: String
    public var seconds: Double
    public var devices: [TrendDevice]

    public init(id: String, label: String, seconds: Double, devices: [TrendDevice]) {
        self.id = id
        self.label = label
        self.seconds = seconds
        self.devices = devices
    }
}

/// Insights activity already summed by the desktop app.
public struct TrendSnapshot: Codable, Sendable, Equatable {
    public var period: String
    public var title: String
    public var buckets: [TrendBucket]
    public var top: [WidgetApp]

    public init(period: String, title: String, buckets: [TrendBucket], top: [WidgetApp]) {
        self.period = period
        self.title = title
        self.buckets = buckets
        self.top = top
    }

    public static let empty = TrendSnapshot(period: "day", title: "", buckets: [], top: [])

    public var bars: [TrendBucket] { buckets }

    public var apps: [WidgetApp] { Array(top.prefix(4)) }

    public var peakSeconds: Double {
        bars.map(\.seconds).max() ?? 0
    }

    public var isEmpty: Bool { buckets.isEmpty && top.isEmpty }

    public var trackedSeconds: Double {
        let fromBars = buckets.reduce(0) { $0 + $1.seconds }
        if fromBars > 0 { return fromBars }
        return top.reduce(0) { $0 + $1.seconds }
    }

    public static func decode(_ data: Data) throws -> TrendSnapshot {
        try JSONDecoder().decode(TrendSnapshot.self, from: data)
    }
}

public enum TrendStore {
    public static let fileName = "trend.json"
    public static let kind = "StopScrollingTrend"

    public static func load(from data: Data?) -> TrendSnapshot {
        guard let data, let snapshot = try? TrendSnapshot.decode(data) else { return .empty }
        return snapshot
    }

    public static func loadFromGroup() -> TrendSnapshot {
        if let container = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: WidgetStore.groupIdentifier
        ),
           let snapshot = read(container.appendingPathComponent(fileName)) {
            return snapshot
        }
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
        if let support, let snapshot = read(support.appendingPathComponent(fileName)) {
            return snapshot
        }
        return .empty
    }

    private static func read(_ url: URL) -> TrendSnapshot? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? TrendSnapshot.decode(data)
    }
}

public func trendShowsAxisLabel(period: String, index: Int, count: Int) -> Bool {
    if count <= 7 { return true }
    if period == "day" { return index % 6 == 0 }
    if period == "year" { return true }
    return index % 5 == 0
}
