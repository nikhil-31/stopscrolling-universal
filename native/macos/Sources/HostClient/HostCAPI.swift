import Darwin
import Foundation

private func copyCString(_ value: String) -> UnsafeMutablePointer<CChar>? {
    value.withCString { pointer in
        strdup(pointer)
    }
}

private func writeJSON<T: Encodable>(
    _ value: T,
    to result: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>?
) -> Int32 {
    do {
        let data = try JSONEncoder().encode(value)
        guard let json = String(data: data, encoding: .utf8) else { return 1 }
        result?.pointee = copyCString(json)
        return 0
    } catch {
        return 1
    }
}

private func writeError(_ message: String, to error: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>?) {
    error?.pointee = copyCString(message)
}

@_cdecl("ss_host_free")
public func ss_host_free(_ pointer: UnsafeMutablePointer<CChar>?) {
    if let pointer { free(pointer) }
}

@_cdecl("ss_host_request")
public func ss_host_request(
    _ operation: UnsafePointer<CChar>?,
    _ body: UnsafePointer<CChar>?,
    _ result: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>?,
    _ errorOut: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>?
) -> Int32 {
    guard let operation else {
        writeError(HostClientError.malformedRequest.rawValue, to: errorOut)
        return 1
    }
    let name = String(cString: operation)
    let payload = body.map { Data(String(cString: $0).utf8) }
    do {
        let data = try HostXPCClient.shared.request(operation: name, body: payload)
        result?.pointee = copyCString(String(data: data, encoding: .utf8) ?? "{}")
        return 0
    } catch let clientError as HostClientError {
        writeError(clientError.rawValue, to: errorOut)
        return 1
    } catch {
        writeError(HostClientError.xpcFailed.rawValue, to: errorOut)
        return 1
    }
}

@_cdecl("ss_host_activate")
public func ss_host_activate(
    _ result: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>?,
    _ errorOut: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>?
) -> Int32 {
    let status = HostActivation.shared.activate()
    if let lastError = status.lastError {
        writeError(lastError, to: errorOut)
    }
    return writeJSON(status, to: result)
}

@_cdecl("ss_host_setup")
public func ss_host_setup(
    _ result: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>?,
    _ errorOut: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>?
) -> Int32 {
    _ = errorOut
    return writeJSON(HostActivation.shared.currentSetup(), to: result)
}

@_cdecl("ss_host_close")
public func ss_host_close() {
    HostXPCClient.shared.close()
}
