import WidgetKit

/// Reloads the desktop widget from the containing Electron process.
/// The kind matches `StaticConfiguration` in the widget extension.
@_cdecl("stopscrolling_reload_time_widget")
public func stopscrollingReloadTimeWidget() {
    WidgetCenter.shared.reloadTimelines(ofKind: "StopScrollingTime")
    WidgetCenter.shared.reloadTimelines(ofKind: "StopScrollingTrend")
}
