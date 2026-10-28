import CoreGraphics
import EventKit
import Foundation

/// Read-only Calendar.app access for the Electron process, called through koffi.
///
/// `ss_calendar_request(op, body)` takes a JSON body and returns JSON in `result`, or a message in
/// `error` with a non-zero status. Strings handed back must be released with `ss_calendar_free`.
/// Calls block (the permission prompt waits for the user), so the caller runs them off the main thread.

private let lock = NSLock()
private var store = EKEventStore()

private struct CalendarRow: Encodable {
    let id: String
    let title: String
    let sourceTitle: String
    let colorHex: String?
    let isGoogleSourced: Bool
}

private struct EventRow: Encodable {
    let id: String
    let icalUid: String?
    let title: String
    let start: String
    let end: String
    let isAllDay: Bool
    let calendarId: String
    let calendarName: String
    let colorHex: String?
}

private struct EventsRequest: Decodable {
    let start: Date
    let end: Date
    let calendarIds: [String]
}

private enum BridgeError: Error {
    case message(String)
}

private func accessName(_ status: EKAuthorizationStatus) -> String {
    if #available(macOS 14.0, *) {
        switch status {
        case .fullAccess: return "fullAccess"
        case .writeOnly: return "writeOnly"
        default: break
        }
    }
    switch status {
    case .notDetermined: return "notDetermined"
    case .restricted: return "restricted"
    case .denied: return "denied"
    case .authorized: return "fullAccess"
    default: return "denied"
    }
}

private func currentAccess() -> String {
    accessName(EKEventStore.authorizationStatus(for: .event))
}

private func requestAccess() -> String {
    guard currentAccess() == "notDetermined" else { return currentAccess() }
    let done = DispatchSemaphore(value: 0)
    let completion: (Bool, Error?) -> Void = { _, _ in done.signal() }
    lock.lock()
    let requester = store
    lock.unlock()
    if #available(macOS 14.0, *) {
        requester.requestFullAccessToEvents(completion: completion)
    } else {
        requester.requestAccess(to: .event, completion: completion)
    }
    done.wait()
    // A store created before access was granted doesn't see any calendars.
    lock.lock()
    store = EKEventStore()
    lock.unlock()
    return currentAccess()
}

private func isGoogleSourced(_ calendar: EKCalendar) -> Bool {
    let sourceTitle = calendar.source?.title.lowercased() ?? ""
    if sourceTitle.contains("google") { return true }
    if calendar.source?.sourceType == .calDAV, sourceTitle.contains("gmail") { return true }
    return false
}

private func hexString(_ color: CGColor?) -> String? {
    guard let color,
          let components = color.converted(to: CGColorSpaceCreateDeviceRGB(), intent: .defaultIntent, options: nil)?.components,
          components.count >= 3 else { return nil }
    let red = Int((components[0] * 255).rounded())
    let green = Int((components[1] * 255).rounded())
    let blue = Int((components[2] * 255).rounded())
    return String(format: "#%02X%02X%02X", red, green, blue)
}

private func listCalendars() -> [CalendarRow] {
    store.calendars(for: .event).map { calendar in
        CalendarRow(
            id: calendar.calendarIdentifier,
            title: calendar.title,
            sourceTitle: calendar.source?.title ?? "",
            colorHex: hexString(calendar.cgColor),
            isGoogleSourced: isGoogleSourced(calendar)
        )
    }
}

private let isoFormatter: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime]
    return formatter
}()

/// All-day events become YYYY-MM-DD with an exclusive end, matching Google's all-day format.
private func dayString(_ date: Date) -> String {
    let parts = Calendar.current.dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
}

private func listEvents(_ request: EventsRequest) -> [EventRow] {
    let wanted = Set(request.calendarIds)
    let calendars = store.calendars(for: .event).filter { wanted.contains($0.calendarIdentifier) }
    guard !calendars.isEmpty, request.end > request.start else { return [] }
    let predicate = store.predicateForEvents(withStart: request.start, end: request.end, calendars: calendars)
    return store.events(matching: predicate).compactMap { event in
        guard let calendar = event.calendar, let start = event.startDate, let end = event.endDate else { return nil }
        let startValue: String
        let endValue: String
        if event.isAllDay {
            startValue = dayString(start)
            let lastDay = Calendar.current.startOfDay(for: end.addingTimeInterval(-1))
            endValue = dayString(Calendar.current.date(byAdding: .day, value: 1, to: max(lastDay, start)) ?? end)
        } else {
            startValue = isoFormatter.string(from: start)
            endValue = isoFormatter.string(from: end)
        }
        // Occurrences of a repeating event share an identifier, so the start time keeps ids unique.
        let identifier = event.eventIdentifier ?? event.calendarItemIdentifier
        return EventRow(
            id: "apple:\(identifier):\(Int(start.timeIntervalSince1970))",
            icalUid: event.calendarItemExternalIdentifier,
            title: (event.title?.isEmpty == false ? event.title : nil) ?? "(No title)",
            start: startValue,
            end: endValue,
            isAllDay: event.isAllDay,
            calendarId: calendar.calendarIdentifier,
            calendarName: calendar.title,
            colorHex: hexString(calendar.cgColor)
        )
    }
}

private func handle(_ operation: String, _ body: Data) throws -> Data {
    let encoder = JSONEncoder()
    switch operation {
    case "authorizationStatus":
        return try encoder.encode(["access": currentAccess()])
    case "requestAccess":
        return try encoder.encode(["access": requestAccess()])
    case "listCalendars":
        guard currentAccess() == "fullAccess" else { return try encoder.encode([CalendarRow]()) }
        return try encoder.encode(listCalendars())
    case "events":
        guard currentAccess() == "fullAccess" else { return try encoder.encode([EventRow]()) }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let text = try decoder.singleValueContainer().decode(String.self)
            let fractional = ISO8601DateFormatter()
            fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            guard let date = fractional.date(from: text) ?? isoFormatter.date(from: text) else {
                throw BridgeError.message("Invalid date: \(text)")
            }
            return date
        }
        return try encoder.encode(listEvents(try decoder.decode(EventsRequest.self, from: body)))
    default:
        throw BridgeError.message("Unknown operation: \(operation)")
    }
}

private func output(_ text: String, _ slot: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>?) {
    slot?.pointee = strdup(text)
}

@_cdecl("ss_calendar_request")
public func ssCalendarRequest(
    _ operation: UnsafePointer<CChar>?,
    _ body: UnsafePointer<CChar>?,
    _ result: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>?,
    _ errorOut: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>?
) -> Int32 {
    let name = operation.map { String(cString: $0) } ?? ""
    let data = body.map { Data(String(cString: $0).utf8) } ?? Data("{}".utf8)
    // The permission prompt waits on the user, so it runs without holding the store lock.
    let locked = name != "requestAccess"
    if locked { lock.lock() }
    defer { if locked { lock.unlock() } }
    do {
        output(String(decoding: try handle(name, data), as: UTF8.self), result)
        return 0
    } catch BridgeError.message(let message) {
        output(message, errorOut)
        return 1
    } catch {
        output(error.localizedDescription, errorOut)
        return 1
    }
}

@_cdecl("ss_calendar_free")
public func ssCalendarFree(_ pointer: UnsafeMutablePointer<CChar>?) {
    free(pointer)
}
