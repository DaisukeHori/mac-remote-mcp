import Foundation

// Pure functions extracted from Config/ProcessManager/AppDelegate for testability.
// No side effects, no file system access — just logic.

// MARK: - Env File Parsing

struct EnvParser {
    static func parse(_ content: String) -> [String: String] {
        var result: [String: String] = [:]
        for line in content.components(separatedBy: .newlines) {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.isEmpty || trimmed.hasPrefix("#") { continue }
            let parts = trimmed.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
            if parts.count == 2 {
                result[String(parts[0])] = String(parts[1])
            }
        }
        return result
    }
}

// MARK: - Status Determination

enum ServiceStatus: String {
    case allRunning = "● All Running"
    case partiallyRunning = "◐ Partially Running"
    case stopped = "○ Stopped"
}

struct StatusResolver {
    static func resolve(server: Bool, playwright: Bool) -> ServiceStatus {
        if server && playwright { return .allRunning }
        if server || playwright { return .partiallyRunning }
        return .stopped
    }

    static func menuIcon(for status: ServiceStatus) -> String {
        switch status {
        case .allRunning: return "server.rack"
        case .partiallyRunning: return "exclamationmark.triangle"
        case .stopped: return "xmark.circle"
        }
    }

    static func toggleTitle(running: Bool, service: String) -> String {
        return running ? "⏹ Stop \(service)" : "▶ Start \(service)"
    }
}

// MARK: - Install Directory Resolution

struct InstallDirResolver {
    static func resolve(bundlePath: String, homePath: String, fileExists: (String) -> Bool) -> String {
        let appParent = (bundlePath as NSString).deletingLastPathComponent

        if fileExists(appParent + "/dist/index.js") {
            return appParent
        }
        if fileExists(appParent + "/mac-remote-mcp/dist/index.js") {
            return appParent + "/mac-remote-mcp"
        }
        if fileExists(homePath + "/mac-remote-mcp/dist/index.js") {
            return homePath + "/mac-remote-mcp"
        }
        return appParent
    }
}

// MARK: - Dangerous Command Detection (shared with Node.js server)

struct CommandSafety {
    static let dangerousPatterns: [(pattern: String, description: String)] = [
        (#"rm\s+(-rf?|--recursive)\s+[\/~]"#, "recursive delete system path"),
        (#"mkfs\b"#, "format filesystem"),
        (#"dd\s+if="#, "disk write"),
        (#"shutdown\b"#, "shutdown"),
        (#"reboot\b"#, "reboot"),
        (#"sudo\s+rm"#, "sudo remove"),
        (#"curl\b.*\|\s*(ba)?sh"#, "curl pipe to shell"),
        (#"chmod\s+-R\s+777\s+/"#, "chmod 777 system path"),
    ]

    static func isDangerous(_ command: String) -> (blocked: Bool, reason: String?) {
        for (pattern, description) in dangerousPatterns {
            if let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive) {
                let range = NSRange(command.startIndex..., in: command)
                if regex.firstMatch(in: command, range: range) != nil {
                    return (true, description)
                }
            }
        }
        return (false, nil)
    }
}

// MARK: - Port Validation

struct PortValidator {
    static func isValid(_ port: Int) -> Bool {
        return port >= 1 && port <= 65535
    }

    static func isPrivileged(_ port: Int) -> Bool {
        return port < 1024
    }

    static func defaultPorts() -> (server: Int, playwright: Int, proxy: Int) {
        return (3000, 3001, 3002)
    }
}

// MARK: - API Key Validation

struct ApiKeyValidator {
    static func isValid(_ key: String) -> Bool {
        return key.count >= 16
    }

    static func isHex(_ key: String) -> Bool {
        return key.range(of: "^[0-9a-f]+$", options: .regularExpression) != nil
    }

    static func maskedDisplay(_ key: String) -> String {
        if key.count <= 8 { return "***" }
        return String(key.prefix(8)) + "..."
    }
}

// MARK: - Log Path Builder

struct LogPathBuilder {
    static func auditLogPath(logDir: String, date: Date = Date()) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return logDir + "/audit-\(formatter.string(from: date)).log"
    }

    static func serviceLogPath(logDir: String, service: String, stream: String) -> String {
        return logDir + "/\(service).\(stream).log"
    }
}
