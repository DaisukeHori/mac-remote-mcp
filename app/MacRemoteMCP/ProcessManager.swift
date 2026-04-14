import Foundation

class ProcessManager {
    private var serverProcess: Process?
    private var playwrightProcess: Process?
    private var playwrightProxyProcess: Process?
    private var caffeinateProcess: Process?

    var isServerRunning: Bool { serverProcess?.isRunning ?? false }
    var isPlaywrightRunning: Bool { playwrightProcess?.isRunning ?? false }
    var isCaffeinateRunning: Bool { caffeinateProcess?.isRunning ?? false }

    // MARK: - MCP Server

    func startServer() {
        guard !isServerRunning else { return }

        let config = Config.shared
        let process = Process()
        process.executableURL = URL(fileURLWithPath: config.nodePath)
        process.arguments = [config.installDir + "/dist/index.js"]
        process.environment = [
            "TRANSPORT": "http",
            "PORT": String(config.serverPort),
            "HOST": "127.0.0.1",
            "MCP_API_KEY": config.apiKey,
            "PATH": config.pathEnv,
        ]
        process.currentDirectoryURL = URL(fileURLWithPath: config.installDir)

        let outPipe = logPipe(name: "server.stdout")
        let errPipe = logPipe(name: "server.stderr")
        process.standardOutput = outPipe
        process.standardError = errPipe

        do {
            try process.run()
            serverProcess = process
            log("MCP Server started (PID: \(process.processIdentifier))")
        } catch {
            log("Failed to start MCP Server: \(error)")
        }
    }

    func stopServer() {
        guard let process = serverProcess, process.isRunning else { return }
        process.terminate()
        process.waitUntilExit()
        serverProcess = nil
        log("MCP Server stopped")
    }

    // MARK: - Playwright MCP + Proxy

    func startPlaywright() {
        guard !isPlaywrightRunning else { return }

        let config = Config.shared

        // Start Playwright MCP
        let pw = Process()
        pw.executableURL = URL(fileURLWithPath: config.npxPath)
        pw.arguments = [
            "@playwright/mcp@latest",
            "--port", String(config.playwrightPort),
            "--host", "127.0.0.1",
            "--caps", "core,vision,devtools",
        ]
        pw.environment = [
            "PATH": config.pathEnv,
            "PLAYWRIGHT_MCP_CONSOLE_LEVEL": "info",
        ]

        let pwOut = logPipe(name: "playwright.stdout")
        let pwErr = logPipe(name: "playwright.stderr")
        pw.standardOutput = pwOut
        pw.standardError = pwErr

        do {
            try pw.run()
            playwrightProcess = pw
            log("Playwright MCP started (PID: \(pw.processIdentifier))")
        } catch {
            log("Failed to start Playwright: \(error)")
        }

        // Start auth proxy (after a short delay for Playwright to bind)
        DispatchQueue.global().asyncAfter(deadline: .now() + 2) { [weak self] in
            self?.startPlaywrightProxy()
        }
    }

    private func startPlaywrightProxy() {
        let config = Config.shared

        let proxy = Process()
        proxy.executableURL = URL(fileURLWithPath: config.nodePath)
        proxy.arguments = [config.installDir + "/dist/playwright-proxy/index.js"]
        proxy.environment = [
            "PLAYWRIGHT_PORT": String(config.playwrightPort),
            "PROXY_PORT": String(config.proxyPort),
            "MCP_API_KEY": config.apiKey,
            "PATH": config.pathEnv,
        ]
        proxy.currentDirectoryURL = URL(fileURLWithPath: config.installDir)

        let proxyOut = logPipe(name: "playwright-proxy.stdout")
        let proxyErr = logPipe(name: "playwright-proxy.stderr")
        proxy.standardOutput = proxyOut
        proxy.standardError = proxyErr

        do {
            try proxy.run()
            playwrightProxyProcess = proxy
            log("Playwright Proxy started (PID: \(proxy.processIdentifier))")
        } catch {
            log("Failed to start Playwright Proxy: \(error)")
        }
    }

    func stopPlaywright() {
        if let proxy = playwrightProxyProcess, proxy.isRunning {
            proxy.terminate()
            proxy.waitUntilExit()
            playwrightProxyProcess = nil
        }
        if let pw = playwrightProcess, pw.isRunning {
            pw.terminate()
            pw.waitUntilExit()
            playwrightProcess = nil
        }
        log("Playwright stopped")
    }

    // MARK: - Caffeinate

    func startCaffeinate() {
        guard !isCaffeinateRunning else { return }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/caffeinate")
        process.arguments = ["-d", "-i", "-s"]

        do {
            try process.run()
            caffeinateProcess = process
            log("Caffeinate started (PID: \(process.processIdentifier))")
        } catch {
            log("Failed to start caffeinate: \(error)")
        }
    }

    func stopCaffeinate() {
        guard let process = caffeinateProcess, process.isRunning else { return }
        process.terminate()
        process.waitUntilExit()
        caffeinateProcess = nil
        log("Caffeinate stopped")
    }

    // MARK: - All

    func startAll() {
        startCaffeinate()
        startServer()
        startPlaywright()
    }

    func stopAll() {
        stopPlaywright()
        stopServer()
        stopCaffeinate()
    }

    // MARK: - Helpers

    private func logPipe(name: String) -> Pipe {
        let pipe = Pipe()
        let logPath = Config.shared.logDir + "/\(name).log"
        FileManager.default.createFile(atPath: logPath, contents: nil)
        if let handle = FileHandle(forWritingAtPath: logPath) {
            handle.seekToEndOfFile()
            pipe.fileHandleForReading.readabilityHandler = { readHandle in
                let data = readHandle.availableData
                if !data.isEmpty {
                    handle.write(data)
                }
            }
        }
        return pipe
    }

    private func log(_ message: String) {
        let timestamp = ISO8601DateFormatter().string(from: Date())
        let line = "[\(timestamp)] \(message)\n"
        let logPath = Config.shared.logDir + "/app.log"

        if !FileManager.default.fileExists(atPath: logPath) {
            FileManager.default.createFile(atPath: logPath, contents: nil)
        }
        if let handle = FileHandle(forWritingAtPath: logPath) {
            handle.seekToEndOfFile()
            handle.write(line.data(using: .utf8) ?? Data())
            handle.closeFile()
        }
        NSLog("MacRemoteMCP: %@", message)
    }
}
