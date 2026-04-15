import Foundation

class Config {
    static let shared = Config()

    let installDir: String
    let logDir: String
    let configDir: String
    let apiKey: String
    let serverPort: Int
    let playwrightPort: Int
    let proxyPort: Int
    let autoStart: Bool
    let tunnelToken: String
    let tunnelHostname: String
    let nodePath: String
    let npxPath: String
    let pathEnv: String

    private init() {
        let home = NSHomeDirectory()
        let bundlePath = Bundle.main.bundlePath
        let bundleResources = bundlePath + "/Contents/Resources/mcp-server"
        let appParent = (bundlePath as NSString).deletingLastPathComponent

        // Install dir: where dist/index.js lives
        if FileManager.default.fileExists(atPath: bundleResources + "/dist/index.js") {
            installDir = bundleResources
        } else if FileManager.default.fileExists(atPath: appParent + "/dist/index.js") {
            installDir = appParent
        } else if FileManager.default.fileExists(atPath: appParent + "/mac-remote-mcp/dist/index.js") {
            installDir = appParent + "/mac-remote-mcp"
        } else if FileManager.default.fileExists(atPath: home + "/mac-remote-mcp/dist/index.js") {
            installDir = home + "/mac-remote-mcp"
        } else {
            installDir = bundleResources
        }

        // Config & Log directories (always writable)
        configDir = home + "/.mac-remote-mcp"
        logDir = configDir + "/logs"
        try? FileManager.default.createDirectory(atPath: logDir, withIntermediateDirectories: true)

        // Load .env from ~/.mac-remote-mcp/.env (writable location)
        let envPath = configDir + "/.env"
        var envVars: [String: String] = [:]
        if let contents = try? String(contentsOfFile: envPath, encoding: .utf8) {
            for line in contents.components(separatedBy: .newlines) {
                let trimmed = line.trimmingCharacters(in: .whitespaces)
                if trimmed.isEmpty || trimmed.hasPrefix("#") { continue }
                let parts = trimmed.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
                if parts.count == 2 {
                    envVars[String(parts[0])] = String(parts[1])
                }
            }
        }

        // API Key: load from .env or generate + persist
        if let existingKey = envVars["MCP_API_KEY"], !existingKey.isEmpty {
            apiKey = existingKey
        } else {
            let newKey = Config.generateApiKey()
            apiKey = newKey
            envVars["MCP_API_KEY"] = newKey
            Config.saveEnv(envVars, to: envPath)
        }

        serverPort = Int(envVars["PORT"] ?? "3000") ?? 3000
        playwrightPort = Int(envVars["PLAYWRIGHT_PORT"] ?? "3001") ?? 3001
        proxyPort = Int(envVars["PROXY_PORT"] ?? "3002") ?? 3002
        autoStart = (envVars["AUTO_START"] ?? "false").lowercased() == "true"
        tunnelToken = envVars["CLOUDFLARE_TUNNEL_TOKEN"] ?? ""
        tunnelHostname = envVars["TUNNEL_HOSTNAME"] ?? ""

        // Find node/npx
        let searchPaths = [
            "/opt/homebrew/bin",
            "/usr/local/bin",
            "/usr/bin",
            home + "/.nvm/versions/node/v22.0.0/bin",
        ]

        nodePath = Config.findExecutable("node", in: searchPaths) ?? "/usr/local/bin/node"
        npxPath = Config.findExecutable("npx", in: searchPaths) ?? "/usr/local/bin/npx"
        pathEnv = searchPaths.joined(separator: ":") + ":/usr/bin:/bin:/usr/sbin:/sbin"
    }

    // MARK: - Save .env

    private static func saveEnv(_ vars: [String: String], to path: String) {
        var lines = [
            "# mac-remote-mcp configuration",
            "# Auto-generated on first launch",
            ""
        ]
        let orderedKeys = ["MCP_API_KEY", "PORT", "PLAYWRIGHT_PORT", "PROXY_PORT", "AUTO_START", "CLOUDFLARE_TUNNEL_TOKEN", "TUNNEL_HOSTNAME"]
        let defaults: [String: String] = [
            "PORT": "3000",
            "PLAYWRIGHT_PORT": "3001",
            "PROXY_PORT": "3002",
            "AUTO_START": "false",
        ]

        for key in orderedKeys {
            let value = vars[key] ?? defaults[key] ?? ""
            if !value.isEmpty {
                lines.append("\(key)=\(value)")
            }
        }
        // Add any extra keys
        for (key, value) in vars where !orderedKeys.contains(key) {
            lines.append("\(key)=\(value)")
        }
        lines.append("")
        let content = lines.joined(separator: "\n")
        try? content.write(toFile: path, atomically: true, encoding: .utf8)
    }

    // MARK: - Helpers

    private static func findExecutable(_ name: String, in paths: [String]) -> String? {
        for dir in paths {
            let path = dir + "/" + name
            if FileManager.default.isExecutableFile(atPath: path) {
                return path
            }
        }
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/bin/which")
        task.arguments = [name]
        let pipe = Pipe()
        task.standardOutput = pipe
        try? task.run()
        task.waitUntilExit()
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        let result = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
        return result?.isEmpty == false ? result : nil
    }

    private static func generateApiKey() -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return bytes.map { String(format: "%02x", $0) }.joined()
    }
}
