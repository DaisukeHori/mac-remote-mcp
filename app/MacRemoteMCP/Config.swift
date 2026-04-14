import Foundation

class Config {
    static let shared = Config()

    let installDir: String
    let logDir: String
    let apiKey: String
    let serverPort: Int
    let playwrightPort: Int
    let proxyPort: Int
    let autoStart: Bool
    let nodePath: String
    let npxPath: String
    let pathEnv: String

    private init() {
        // Determine install directory (adjacent to .app or from env)
        let bundlePath = Bundle.main.bundlePath
        let appParent = (bundlePath as NSString).deletingLastPathComponent

        // Check if mac-remote-mcp project is in the same directory as the .app
        if FileManager.default.fileExists(atPath: appParent + "/dist/index.js") {
            installDir = appParent
        } else if FileManager.default.fileExists(atPath: appParent + "/mac-remote-mcp/dist/index.js") {
            installDir = appParent + "/mac-remote-mcp"
        } else {
            // Fall back to well-known location
            let home = NSHomeDirectory()
            if FileManager.default.fileExists(atPath: home + "/mac-remote-mcp/dist/index.js") {
                installDir = home + "/mac-remote-mcp"
            } else {
                installDir = appParent
            }
        }

        // Log directory
        let home = NSHomeDirectory()
        logDir = home + "/.mac-remote-mcp/logs"
        try? FileManager.default.createDirectory(atPath: logDir, withIntermediateDirectories: true)

        // Load .env file
        let envPath = installDir + "/.env"
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

        apiKey = envVars["MCP_API_KEY"] ?? Config.generateApiKey()
        serverPort = Int(envVars["PORT"] ?? "3000") ?? 3000
        playwrightPort = Int(envVars["PLAYWRIGHT_PORT"] ?? "3001") ?? 3001
        proxyPort = Int(envVars["PROXY_PORT"] ?? "3002") ?? 3002
        autoStart = (envVars["AUTO_START"] ?? "false").lowercased() == "true"

        // Find node/npx in common locations
        let searchPaths = [
            "/opt/homebrew/bin",
            "/usr/local/bin",
            "/usr/bin",
            home + "/.nvm/versions/node/v22.0.0/bin",  // Common NVM path
        ]

        nodePath = Config.findExecutable("node", in: searchPaths) ?? "/usr/local/bin/node"
        npxPath = Config.findExecutable("npx", in: searchPaths) ?? "/usr/local/bin/npx"
        pathEnv = searchPaths.joined(separator: ":") + ":/usr/bin:/bin:/usr/sbin:/sbin"
    }

    private static func findExecutable(_ name: String, in paths: [String]) -> String? {
        for dir in paths {
            let path = dir + "/" + name
            if FileManager.default.isExecutableFile(atPath: path) {
                return path
            }
        }
        // Try `which`
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
        // Generate a random hex key
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return bytes.map { String(format: "%02x", $0) }.joined()
    }
}
