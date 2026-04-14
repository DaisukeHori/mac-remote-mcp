import Cocoa

@NSApplicationMain
class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem!
    private var processManager: ProcessManager!
    private var statusMenuItem: NSMenuItem!
    private var apiKeyMenuItem: NSMenuItem!
    private var toggleServerMenuItem: NSMenuItem!
    private var togglePlaywrightMenuItem: NSMenuItem!
    private var toggleCaffeinateMenuItem: NSMenuItem!
    private var tunnelMenuItem: NSMenuItem!
    private var toggleTunnelMenuItem: NSMenuItem!

    func applicationDidFinishLaunching(_ notification: Notification) {
        processManager = ProcessManager()

        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)

        if let button = statusItem.button {
            button.image = NSImage(systemSymbolName: "server.rack", accessibilityDescription: "MCP")
            button.image?.isTemplate = true
        }

        // Watch for tunnel URL updates
        NotificationCenter.default.addObserver(
            self, selector: #selector(tunnelURLDidChange(_:)),
            name: .tunnelURLChanged, object: nil
        )

        buildMenu()

        // Auto-start if configured
        if Config.shared.autoStart {
            processManager.startAll()
            updateMenuState()
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        processManager.stopAll()
    }

    // MARK: - Menu

    private func buildMenu() {
        let menu = NSMenu()

        // Status
        statusMenuItem = NSMenuItem(title: "Status: Stopped", action: nil, keyEquivalent: "")
        statusMenuItem.isEnabled = false
        menu.addItem(statusMenuItem)

        // API Key
        apiKeyMenuItem = NSMenuItem(title: "API Key: loading...", action: #selector(copyApiKey), keyEquivalent: "k")
        menu.addItem(apiKeyMenuItem)

        menu.addItem(NSMenuItem.separator())

        // MCP Server toggle
        toggleServerMenuItem = NSMenuItem(title: "Start MCP Server", action: #selector(toggleServer), keyEquivalent: "s")
        menu.addItem(toggleServerMenuItem)

        // Playwright toggle
        togglePlaywrightMenuItem = NSMenuItem(title: "Start Playwright", action: #selector(togglePlaywright), keyEquivalent: "p")
        menu.addItem(togglePlaywrightMenuItem)

        // Caffeinate toggle
        toggleCaffeinateMenuItem = NSMenuItem(title: "Start Caffeinate", action: #selector(toggleCaffeinate), keyEquivalent: "c")
        menu.addItem(toggleCaffeinateMenuItem)

        menu.addItem(NSMenuItem.separator())

        // Tunnel section
        tunnelMenuItem = NSMenuItem(title: "🌐 Tunnel: Not running", action: nil, keyEquivalent: "")
        tunnelMenuItem.isEnabled = false
        menu.addItem(tunnelMenuItem)

        toggleTunnelMenuItem = NSMenuItem(title: "▶ Start Quick Tunnel (free)", action: #selector(toggleTunnel), keyEquivalent: "t")
        menu.addItem(toggleTunnelMenuItem)

        let copyURLItem = NSMenuItem(title: "Copy MCP URL", action: #selector(copyTunnelURL), keyEquivalent: "u")
        menu.addItem(copyURLItem)

        menu.addItem(NSMenuItem.separator())

        // Start/Stop All
        let startAllItem = NSMenuItem(title: "Start All", action: #selector(startAll), keyEquivalent: "r")
        menu.addItem(startAllItem)

        let stopAllItem = NSMenuItem(title: "Stop All", action: #selector(stopAll), keyEquivalent: "x")
        menu.addItem(stopAllItem)

        menu.addItem(NSMenuItem.separator())

        // Open Logs
        let logsItem = NSMenuItem(title: "Open Logs...", action: #selector(openLogs), keyEquivalent: "l")
        menu.addItem(logsItem)

        // Open Config
        let configItem = NSMenuItem(title: "Edit Config...", action: #selector(openConfig), keyEquivalent: ",")
        menu.addItem(configItem)

        menu.addItem(NSMenuItem.separator())

        // Quit
        let quitItem = NSMenuItem(title: "Quit MacRemoteMCP", action: #selector(quit), keyEquivalent: "q")
        menu.addItem(quitItem)

        statusItem.menu = menu

        // Load API key
        apiKeyMenuItem.title = "API Key: \(Config.shared.apiKey.prefix(8))..."

        updateMenuState()
    }

    private func updateMenuState() {
        let serverRunning = processManager.isServerRunning
        let playwrightRunning = processManager.isPlaywrightRunning
        let caffeinateRunning = processManager.isCaffeinateRunning
        let tunnelRunning = processManager.isTunnelRunning
        let tunnelURL = processManager.tunnelURL

        toggleServerMenuItem.title = serverRunning ? "⏹ Stop MCP Server" : "▶ Start MCP Server"
        togglePlaywrightMenuItem.title = playwrightRunning ? "⏹ Stop Playwright" : "▶ Start Playwright"
        toggleCaffeinateMenuItem.title = caffeinateRunning ? "⏹ Stop Caffeinate" : "▶ Start Caffeinate"
        toggleTunnelMenuItem.title = tunnelRunning ? "⏹ Stop Tunnel" : "▶ Start Quick Tunnel (free)"

        // Tunnel URL display
        if let url = tunnelURL {
            tunnelMenuItem.title = "🌐 \(TunnelURLParser.displayURL(url))"
        } else if tunnelRunning {
            tunnelMenuItem.title = "🌐 Tunnel: Connecting..."
        } else {
            tunnelMenuItem.title = "🌐 Tunnel: Not running"
        }

        let allRunning = serverRunning && playwrightRunning
        if allRunning {
            statusMenuItem.title = tunnelURL != nil ? "● Running — Online" : "● All Running (local only)"
            statusItem.button?.image = NSImage(systemSymbolName: "server.rack", accessibilityDescription: "Running")
        } else if serverRunning || playwrightRunning {
            statusMenuItem.title = "◐ Partially Running"
            statusItem.button?.image = NSImage(systemSymbolName: "exclamationmark.triangle", accessibilityDescription: "Partial")
        } else {
            statusMenuItem.title = "○ Stopped"
            statusItem.button?.image = NSImage(systemSymbolName: "xmark.circle", accessibilityDescription: "Stopped")
        }
        statusItem.button?.image?.isTemplate = true
    }

    // MARK: - Actions

    @objc private func toggleServer() {
        if processManager.isServerRunning {
            processManager.stopServer()
        } else {
            processManager.startServer()
        }
        updateMenuState()
    }

    @objc private func togglePlaywright() {
        if processManager.isPlaywrightRunning {
            processManager.stopPlaywright()
        } else {
            processManager.startPlaywright()
        }
        updateMenuState()
    }

    @objc private func toggleCaffeinate() {
        if processManager.isCaffeinateRunning {
            processManager.stopCaffeinate()
        } else {
            processManager.startCaffeinate()
        }
        updateMenuState()
    }

    @objc private func startAll() {
        processManager.startAll()
        updateMenuState()
    }

    @objc private func stopAll() {
        processManager.stopAll()
        updateMenuState()
    }

    @objc private func copyApiKey() {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(Config.shared.apiKey, forType: .string)

        // Visual feedback
        let original = apiKeyMenuItem.title
        apiKeyMenuItem.title = "✓ Copied to clipboard!"
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
            self?.apiKeyMenuItem.title = original
        }
    }

    @objc private func toggleTunnel() {
        if processManager.isTunnelRunning {
            processManager.stopTunnel()
        } else {
            processManager.startQuickTunnel()
        }
        updateMenuState()
    }

    @objc private func copyTunnelURL() {
        guard let url = processManager.tunnelURL else {
            tunnelMenuItem.title = "🌐 Tunnel not running"
            return
        }
        let mcpURL = TunnelURLParser.mcpEndpoint(tunnelURL: url)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(mcpURL, forType: .string)

        let original = tunnelMenuItem.title
        tunnelMenuItem.title = "✓ Copied: \(TunnelURLParser.displayURL(mcpURL))"
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
            self?.tunnelMenuItem.title = original
        }
    }

    @objc private func tunnelURLDidChange(_ notification: Notification) {
        updateMenuState()
    }

    @objc private func openLogs() {
        let logDir = Config.shared.logDir
        NSWorkspace.shared.open(URL(fileURLWithPath: logDir))
    }

    @objc private func openConfig() {
        let envFile = Config.shared.installDir + "/.env"
        if FileManager.default.fileExists(atPath: envFile) {
            NSWorkspace.shared.open(URL(fileURLWithPath: envFile))
        } else {
            let alert = NSAlert()
            alert.messageText = "No .env file found"
            alert.informativeText = "Run scripts/setup.sh first to generate configuration."
            alert.runModal()
        }
    }

    @objc private func quit() {
        processManager.stopAll()
        NSApplication.shared.terminate(nil)
    }
}
