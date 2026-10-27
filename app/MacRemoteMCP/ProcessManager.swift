import Foundation

class ProcessManager {
    private var serverProcess: Process?
    private var playwrightProcess: Process?
    private var playwrightProxyProcess: Process?
    private var caffeinateProcess: Process?
    private var tunnelProcess: Process?
    private(set) var tunnelURL: String?

    var isServerRunning: Bool { serverProcess?.isRunning ?? false }
    var isPlaywrightRunning: Bool { playwrightProcess?.isRunning ?? false }
    var isCaffeinateRunning: Bool { caffeinateProcess?.isRunning ?? false }
    var isTunnelRunning: Bool { tunnelProcess?.isRunning ?? false }

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
            log(L("log.server.started.format", process.processIdentifier))
        } catch {
            log(L("log.server.start_failed.format", String(describing: error)))
        }
    }

    func stopServer() {
        guard let process = serverProcess, process.isRunning else { return }
        process.terminate()
        process.waitUntilExit()
        serverProcess = nil
        log(L("log.server.stopped"))
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
            log(L("log.playwright.started.format", pw.processIdentifier))
        } catch {
            log(L("log.playwright.start_failed.format", String(describing: error)))
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
            log(L("log.playwright_proxy.started.format", proxy.processIdentifier))
        } catch {
            log(L("log.playwright_proxy.start_failed.format", String(describing: error)))
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
        log(L("log.playwright.stopped"))
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
            log(L("log.caffeinate.started.format", process.processIdentifier))
        } catch {
            log(L("log.caffeinate.start_failed.format", String(describing: error)))
        }
    }

    func stopCaffeinate() {
        guard let process = caffeinateProcess, process.isRunning else { return }
        process.terminate()
        process.waitUntilExit()
        caffeinateProcess = nil
        log(L("log.caffeinate.stopped"))
    }

    // MARK: - Cloudflare Quick Tunnel

    func startQuickTunnel() {
        guard !isTunnelRunning else { return }

        let config = Config.shared
        let cloudflaredPath = CloudflaredChecker.findBinary(searchPaths: CloudflaredChecker.defaultSearchPaths)
        guard let cfPath = cloudflaredPath else {
            log(L("log.cloudflared.notfound"))
            return
        }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: cfPath)

        // Named tunnel (fixed URL) vs Quick tunnel (random URL)
        if !config.tunnelToken.isEmpty {
            process.arguments = ["tunnel", "run", "--token", config.tunnelToken]
            log(L("log.tunnel.fixed.starting"))

            // For named tunnels, set the URL from config
            if !config.tunnelHostname.isEmpty {
                DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
                    let url = "https://\(config.tunnelHostname)"
                    self?.tunnelURL = url
                    self?.log(L("log.tunnel.url.fixed.format", url))
                    NotificationCenter.default.post(name: .tunnelURLChanged, object: url)
                }
            }
        } else {
            process.arguments = ["tunnel", "--url", "http://127.0.0.1:\(config.serverPort)"]
        }
        process.environment = ["PATH": config.pathEnv]

        // cloudflared outputs the URL to stderr
        let errPipe = Pipe()
        let outPipe = logPipe(name: "tunnel.stdout")
        process.standardOutput = outPipe
        process.standardError = errPipe

        // Parse stderr for tunnel URL
        errPipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty, let line = String(data: data, encoding: .utf8) else { return }

            // Log to file
            let logPath = Config.shared.logDir + "/tunnel.stderr.log"
            if let fh = FileHandle(forWritingAtPath: logPath) {
                fh.seekToEndOfFile(); fh.write(data); fh.closeFile()
            } else {
                FileManager.default.createFile(atPath: logPath, contents: data)
            }

            // Extract URL
            if self?.tunnelURL == nil, let url = TunnelURLParser.extractURL(from: line) {
                DispatchQueue.main.async {
                    self?.tunnelURL = url
                    self?.log(L("log.tunnel.url.format", url))
                    // Post notification for AppDelegate to update menu
                    NotificationCenter.default.post(name: .tunnelURLChanged, object: url)
                }
            }
        }

        do {
            try process.run()
            tunnelProcess = process
            if config.tunnelToken.isEmpty {
                log(L("log.tunnel.quick.starting.format", process.processIdentifier))
            } else {
                log(L("log.tunnel.fixed.starting.format", process.processIdentifier))
            }
        } catch {
            log(L("log.tunnel.quick.failed.format", String(describing: error)))
        }
    }

    func stopTunnel() {
        if let process = tunnelProcess, process.isRunning {
            process.terminate()
            process.waitUntilExit()
        }
        tunnelProcess = nil
        tunnelURL = nil
        log(L("log.tunnel.stopped"))
        NotificationCenter.default.post(name: .tunnelURLChanged, object: nil)
    }

    // MARK: - All

    func startAll() {
        startCaffeinate()
        startServer()
        startPlaywright()
        // Wait for server to be ready, then start tunnel
        waitForServerAndStartTunnel()
    }

    private func waitForServerAndStartTunnel(attempts: Int = 0) {
        guard attempts < 30 else {
            log(L("log.server.wait_timeout"))
            startQuickTunnel()
            return
        }

        DispatchQueue.global().asyncAfter(deadline: .now() + 0.5) { [weak self] in
            guard let self = self else { return }

            // Use curl to check health (more reliable than URLSession in menu bar apps)
            let task = Process()
            task.executableURL = URL(fileURLWithPath: "/usr/bin/curl")
            task.arguments = ["-s", "-o", "/dev/null", "-w", "%{http_code}",
                              "--connect-timeout", "1",
                              "http://127.0.0.1:\(Config.shared.serverPort)/health"]
            let pipe = Pipe()
            task.standardOutput = pipe
            task.standardError = Pipe()

            do {
                try task.run()
                task.waitUntilExit()
                let data = pipe.fileHandleForReading.readDataToEndOfFile()
                let code = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)

                if code == "200" {
                    DispatchQueue.main.async {
                        self.log(L("log.server.health_confirmed"))
                        self.startQuickTunnel()
                    }
                } else {
                    self.waitForServerAndStartTunnel(attempts: attempts + 1)
                }
            } catch {
                self.waitForServerAndStartTunnel(attempts: attempts + 1)
            }
        }
    }

    func stopAll() {
        stopTunnel()
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

// MARK: - Notification Names
extension Notification.Name {
    static let tunnelURLChanged = Notification.Name("tunnelURLChanged")
}
