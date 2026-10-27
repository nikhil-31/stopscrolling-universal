import Foundation
import Testing
@testable import WidgetCore

@Test func fixtureShowsThreeTotalsAndFiveNames() throws {
    let fixture = """
    {"productiveSeconds":3600,"neutralSeconds":120,"distractingSeconds":45,"unratedSeconds":0,"top":[
      {"key":"a","label":"One","seconds":100},
      {"key":"b","label":"Two","seconds":90},
      {"key":"c","label":"Three","seconds":80},
      {"key":"d","label":"Four","seconds":70},
      {"key":"e","label":"Five","seconds":60},
      {"key":"f","label":"Six","seconds":50}
    ]}
    """.data(using: .utf8)!
    let snapshot = try WidgetSnapshot.decode(fixture)
    #expect(snapshot.verdicts.map(\.label) == ["Productive", "Neutral", "Distracting"])
    #expect(snapshot.verdicts.map(\.seconds) == [3600, 120, 45])
    #expect(snapshot.apps.map(\.label) == ["One", "Two", "Three", "Four", "Five"])
    #expect(formatTrackedDuration(3600) == "1h")
    #expect(formatTrackedDuration(45) == "45s")
}

@Test func unratedAppearsOnlyWhenPresent() throws {
    let withUnrated = """
    {"productiveSeconds":1,"neutralSeconds":0,"distractingSeconds":0,"unratedSeconds":8,"top":[]}
    """.data(using: .utf8)!
    let snapshot = try WidgetSnapshot.decode(withUnrated)
    #expect(snapshot.verdicts.map(\.label) == ["Productive", "Neutral", "Distracting", "Unrated"])
}

@Test func trendDecodesSevenBarsAndFourApps() throws {
    let devices = #"[{"key":"mac","seconds":30,"colorIndex":0},{"key":"phone","seconds":70,"colorIndex":1}]"#
    let bars = (0..<7).map { index in
        let shares = index == 3 ? devices : "[]"
        return #"{"id":"week-\#(index)","label":"\#(index)","seconds":\#(index == 3 ? 100 : 10),"devices":\#(shares)}"#
    }.joined(separator: ",")
    let apps = ["One", "Two", "Three", "Four", "Five", "Six"].enumerated().map { index, name in
        #"{"key":"\#(name)","label":"\#(name)","seconds":\#(60 - index)}"#
    }.joined(separator: ",")
    let fixture = #"{"period":"week","title":"Week 12","buckets":[\#(bars)],"top":[\#(apps)]}"#.data(using: .utf8)!
    let snapshot = try TrendSnapshot.decode(fixture)
    #expect(snapshot.bars.count == 7)
    #expect(snapshot.bars[3].devices.count == 2)
    #expect(snapshot.peakSeconds == 100)
    #expect(snapshot.bars[3].seconds == snapshot.peakSeconds)
    #expect(snapshot.apps.map(\.label) == ["One", "Two", "Three", "Four"])
}

@Test func appRowShowsShareOfTrackedTime() {
    #expect(usagePercentLabel(seconds: 12_060, total: 41_586) == "29%")
    #expect(usageBarFraction(seconds: 12_060, total: 41_586) > 0.28)
    #expect(usageBarFraction(seconds: 12_060, total: 41_586) < 0.30)
    #expect(usagePercentLabel(seconds: 10, total: 10_000) == "<1%")
    #expect(formatTrackedDuration(12_060) == "3h 21m")
}

@Test func widgetClickOpensTheApp() {
    #expect(widgetOpenURL.scheme == "stopscrolling")
    #expect(widgetOpenURL.absoluteString == "stopscrolling://open")
}

@Test func missingDataIsTheEmptyState() {
    let snapshot = WidgetStore.load(from: Data("not json".utf8))
    #expect(snapshot.isEmpty)
    #expect(widgetEmptyCopy == "No tracked time in this period.")
}
