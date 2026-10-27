import SwiftUI
import WidgetKit

struct TimeEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot
}

struct TimeProvider: TimelineProvider {
    func placeholder(in context: Context) -> TimeEntry {
        TimeEntry(date: .now, snapshot: .empty)
    }

    func getSnapshot(in context: Context, completion: @escaping @Sendable (TimeEntry) -> Void) {
        let snapshot = WidgetStore.loadFromGroup()
        completion(TimeEntry(date: .now, snapshot: snapshot))
    }

    func getTimeline(in context: Context, completion: @escaping @Sendable (Timeline<TimeEntry>) -> Void) {
        let snapshot = WidgetStore.loadFromGroup()
        let entry = TimeEntry(date: .now, snapshot: snapshot)
        let next = Date().addingTimeInterval(15 * 60)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

@main
struct StopScrollingWidgets: WidgetBundle {
    var body: some Widget {
        TimeWidget()
        StopScrollingTrend()
    }
}

struct TimeWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: WidgetStore.kind, provider: TimeProvider()) { entry in
            TimeWidgetView(entry: entry)
        }
        .configurationDisplayName("Stop Scrolling")
        .description("Productive, neutral, and distracting time, plus the top apps.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct TimeWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: TimeEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Stop Scrolling")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            if entry.snapshot.isEmpty {
                Text(widgetEmptyCopy)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            } else {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(entry.snapshot.verdicts) { row in
                        HStack(spacing: 6) {
                            Circle()
                                .fill(tint(row.label))
                                .frame(width: 6, height: 6)
                            Text(row.label)
                                .lineLimit(1)
                            Spacer(minLength: 4)
                            Text(formatTrackedDuration(row.seconds))
                                .monospacedDigit()
                        }
                        .font(.caption)
                    }
                }
                if family != .systemSmall {
                    Divider()
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(entry.snapshot.apps) { app in
                            AppUsageRow(label: app.label, seconds: app.seconds, total: entry.snapshot.trackedSeconds)
                        }
                    }
                }
                Spacer(minLength: 0)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .containerBackground(.background, for: .widget)
        .widgetURL(widgetOpenURL)
    }

    private func tint(_ label: String) -> Color {
        switch label {
        case "Productive":
            return Color(red: 18 / 255, green: 150 / 255, blue: 111 / 255)
        case "Distracting":
            return Color(red: 216 / 255, green: 74 / 255, blue: 98 / 255)
        default:
            return .secondary
        }
    }
}

struct AppUsageRow: View {
    let label: String
    let seconds: Double
    let total: Double

    var body: some View {
        HStack(spacing: 8) {
            Text(usagePercentLabel(seconds: seconds, total: total))
                .foregroundStyle(.secondary)
                .frame(width: 32, alignment: .leading)
            UsageMeter(fraction: usageBarFraction(seconds: seconds, total: total))
                .frame(width: 56, height: 6)
            Text(label)
                .lineLimit(1)
                .truncationMode(.tail)
            Spacer(minLength: 4)
            Text(formatTrackedDuration(seconds))
                .foregroundStyle(.secondary)
                .monospacedDigit()
                .layoutPriority(1)
        }
        .font(.caption2)
    }
}

private struct UsageMeter: View {
    let fraction: Double

    var body: some View {
        GeometryReader { geo in
            Capsule()
                .fill(Color.primary.opacity(0.22))
            Capsule()
                .fill(Color.primary)
                .frame(width: max(0, geo.size.width * fraction))
        }
    }
}
