import SwiftUI
import WidgetKit

struct TrendEntry: TimelineEntry {
    let date: Date
    let snapshot: TrendSnapshot
}

struct TrendProvider: TimelineProvider {
    func placeholder(in context: Context) -> TrendEntry {
        TrendEntry(date: .now, snapshot: .empty)
    }

    func getSnapshot(in context: Context, completion: @escaping @Sendable (TrendEntry) -> Void) {
        completion(TrendEntry(date: .now, snapshot: TrendStore.loadFromGroup()))
    }

    func getTimeline(in context: Context, completion: @escaping @Sendable (Timeline<TrendEntry>) -> Void) {
        let entry = TrendEntry(date: .now, snapshot: TrendStore.loadFromGroup())
        let next = Date().addingTimeInterval(15 * 60)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

struct StopScrollingTrend: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: TrendStore.kind, provider: TrendProvider()) { entry in
            TrendWidgetView(entry: entry)
        }
        .configurationDisplayName("Activity trend")
        .description("Tracked time across the Insights period, plus the top apps.")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

struct TrendWidgetView: View {
    let entry: TrendEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            VStack(alignment: .leading, spacing: 1) {
                Text("Activity trend")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                if !entry.snapshot.title.isEmpty {
                    Text(entry.snapshot.title)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            if entry.snapshot.isEmpty {
                Text(trendEmptyCopy)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer(minLength: 0)
            } else {
                TrendBars(snapshot: entry.snapshot)
                    .frame(maxHeight: .infinity)
                if !entry.snapshot.apps.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(entry.snapshot.apps) { app in
                            AppUsageRow(label: app.label, seconds: app.seconds, total: entry.snapshot.trackedSeconds)
                        }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .containerBackground(.background, for: .widget)
        .widgetURL(widgetOpenURL)
    }
}

private struct TrendBars: View {
    let snapshot: TrendSnapshot

    var body: some View {
        HStack(alignment: .bottom, spacing: snapshot.bars.count > 12 ? 1 : 3) {
            ForEach(Array(snapshot.bars.enumerated()), id: \.element.id) { index, bar in
                VStack(spacing: 2) {
                    TrendBar(bucket: bar, peak: snapshot.peakSeconds)
                    Text(trendShowsAxisLabel(period: snapshot.period, index: index, count: snapshot.bars.count) ? bar.label : " ")
                        .font(.system(size: 8))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                }
                .frame(maxWidth: .infinity)
            }
        }
    }
}

private struct TrendBar: View {
    let bucket: TrendBucket
    let peak: Double

    var body: some View {
        GeometryReader { geo in
            let height = barHeight(in: geo.size.height)
            VStack(spacing: 0) {
                Spacer(minLength: 0)
                if bucket.devices.count >= 2 {
                    VStack(spacing: 1) {
                        ForEach(bucket.devices.reversed()) { device in
                            RoundedRectangle(cornerRadius: 1.5, style: .continuous)
                                .fill(trendDeviceColor(device.colorIndex))
                                .frame(height: segmentHeight(device.seconds, total: height))
                        }
                    }
                    .frame(height: height, alignment: .bottom)
                } else {
                    RoundedRectangle(cornerRadius: 1.5, style: .continuous)
                        .fill(trendDeviceColor(bucket.devices.first?.colorIndex ?? 0))
                        .frame(height: height)
                }
            }
        }
    }

    private func barHeight(in available: CGFloat) -> CGFloat {
        guard peak > 0, bucket.seconds > 0 else { return 0 }
        return max(2, available * CGFloat(bucket.seconds / peak))
    }

    private func segmentHeight(_ seconds: Double, total: CGFloat) -> CGFloat {
        guard bucket.seconds > 0 else { return 0 }
        let share = total * CGFloat(seconds / bucket.seconds)
        return max(seconds > 0 ? 1 : 0, share)
    }
}

func trendDeviceColor(_ index: Int) -> Color {
    let palette: [(Double, Double, Double)] = [
        (47, 91, 224),
        (225, 79, 0),
        (123, 44, 191),
        (11, 138, 106),
        (168, 123, 0),
        (26, 124, 168),
        (209, 10, 104),
        (162, 20, 140),
    ]
    let slot = ((index % palette.count) + palette.count) % palette.count
    let color = palette[slot]
    return Color(red: color.0 / 255, green: color.1 / 255, blue: color.2 / 255)
}
