import Foundation

@objc public protocol StopScrollingHelperXPC {
    func applyPolicy(_ envelope: Data, reply: @escaping @Sendable (Data?, Error?) -> Void)
    func status(reply: @escaping @Sendable (Data?, Error?) -> Void)
    func redeemBypass(_ envelope: Data, reply: @escaping @Sendable (Data?, Error?) -> Void)
    func inventory(reply: @escaping @Sendable (Data?, Error?) -> Void)
    func cancelNormal(_ occurrenceID: String, reply: @escaping @Sendable (Error?) -> Void)
}
