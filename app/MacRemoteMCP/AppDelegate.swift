import Cocoa

class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem!
    private var processManager: ProcessManager!
    private var settingsWindow: SettingsWindow!
    private var statusMenuItem: NSMenuItem!
    private var apiKeyMenuItem: NSMenuItem!
    private var toggleServerMenuItem: NSMenuItem!
    private var togglePlaywrightMenuItem: NSMenuItem!
    private var toggleCaffeinateMenuItem: NSMenuItem!
    private var tunnelMenuItem: NSMenuItem!
    private var toggleTunnelMenuItem: NSMenuItem!

    func applicationDidFinishLaunching(_ notification: Notification) {
        processManager = ProcessManager()
        settingsWindow = SettingsWindow()

        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)

        if let button = statusItem.button {
            button.image = NSImage(systemSymbolName: "server.rack", accessibilityDescription: "MCP")
            button.image?.isTemplate = true
        }

        NotificationCenter.default.addObserver(
            self, selector: #selector(tunnelURLDidChange(_:)),
            name: .tunnelURLChanged, object: nil
        )

        buildMenu()

        // Check permissions on first launch
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
            PermissionChecker.showPermissionDialog()
        }

        if Config.shared.autoStart {
            processManager.startAll()
            updateMenuState()
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        processManager.stopAll()
    }

    // MARK: - Menu construction

    private func buildMenu() {
        let menu = NSMenu()

        // Status
        statusMenuItem = NSMenuItem(title: L("menu.status.initial"), action: nil, keyEquivalent: "")
        statusMenuItem.isEnabled = false
        menu.addItem(statusMenuItem)

        // API key
        apiKeyMenuItem = NSMenuItem(title: L("menu.apikey.loading"), action: #selector(copyApiKey), keyEquivalent: "k")
        menu.addItem(apiKeyMenuItem)

        menu.addItem(NSMenuItem.separator())

        // MCP server
        toggleServerMenuItem = NSMenuItem(title: L("menu.server.start"), action: #selector(toggleServer), keyEquivalent: "s")
        menu.addItem(toggleServerMenuItem)

        // Playwright
        togglePlaywrightMenuItem = NSMenuItem(title: L("menu.playwright.start"), action: #selector(togglePlaywright), keyEquivalent: "p")
        menu.addItem(togglePlaywrightMenuItem)

        // Sleep prevention
        toggleCaffeinateMenuItem = NSMenuItem(title: L("menu.caffeinate.start"), action: #selector(toggleCaffeinate), keyEquivalent: "c")
        menu.addItem(toggleCaffeinateMenuItem)

        menu.addItem(NSMenuItem.separator())

        // Tunnel
        tunnelMenuItem = NSMenuItem(title: L("menu.tunnel.disconnected"), action: nil, keyEquivalent: "")
        tunnelMenuItem.isEnabled = false
        menu.addItem(tunnelMenuItem)

        toggleTunnelMenuItem = NSMenuItem(title: L("menu.tunnel.quickstart"), action: #selector(toggleTunnel), keyEquivalent: "t")
        menu.addItem(toggleTunnelMenuItem)

        let copyURLItem = NSMenuItem(title: L("menu.tunnel.copyurl"), action: #selector(copyTunnelURL), keyEquivalent: "u")
        menu.addItem(copyURLItem)

        menu.addItem(NSMenuItem.separator())

        // Global actions
        let startAllItem = NSMenuItem(title: L("menu.startall"), action: #selector(startAll), keyEquivalent: "r")
        menu.addItem(startAllItem)

        let stopAllItem = NSMenuItem(title: L("menu.stopall"), action: #selector(stopAll), keyEquivalent: "x")
        menu.addItem(stopAllItem)

        menu.addItem(NSMenuItem.separator())

        // Logs / settings / permissions
        let logsItem = NSMenuItem(title: L("menu.logs.open"), action: #selector(openLogs), keyEquivalent: "l")
        menu.addItem(logsItem)

        let configItem = NSMenuItem(title: L("menu.settings.edit"), action: #selector(openConfig), keyEquivalent: ",")
        menu.addItem(configItem)

        let permItem = NSMenuItem(title: L("menu.permissions.setup"), action: #selector(setupPermissions), keyEquivalent: "")
        menu.addItem(permItem)

        let profileItem = NSMenuItem(title: L("menu.profile.install"), action: #selector(installProfile), keyEquivalent: "")
        menu.addItem(profileItem)

        menu.addItem(NSMenuItem.separator())

        // Quit
        let quitItem = NSMenuItem(title: L("menu.quit"), action: #selector(quit), keyEquivalent: "q")
        menu.addItem(quitItem)

        statusItem.menu = menu

        apiKeyMenuItem.title = L("menu.apikey.format", String(Config.shared.apiKey.prefix(8)))

        updateMenuState()
    }

    // MARK: - Menu state updates

    private func updateMenuState() {
        let serverRunning = processManager.isServerRunning
        let playwrightRunning = processManager.isPlaywrightRunning
        let caffeinateRunning = processManager.isCaffeinateRunning
        let tunnelRunning = processManager.isTunnelRunning
        let tunnelURL = processManager.tunnelURL

        toggleServerMenuItem.title = serverRunning ? L("menu.server.stop") : L("menu.server.start")
        togglePlaywrightMenuItem.title = playwrightRunning ? L("menu.playwright.stop") : L("menu.playwright.start")
        toggleCaffeinateMenuItem.title = caffeinateRunning ? L("menu.caffeinate.stop") : L("menu.caffeinate.start")
        toggleTunnelMenuItem.title = tunnelRunning ? L("menu.tunnel.stop") : (Config.shared.tunnelToken.isEmpty ? L("menu.tunnel.quickstart") : L("menu.tunnel.fixed.start"))

        if let url = tunnelURL {
            tunnelMenuItem.title = "🌐 \(TunnelURLParser.displayURL(url))"
        } else if tunnelRunning {
            tunnelMenuItem.title = L("menu.tunnel.connecting")
        } else {
            tunnelMenuItem.title = L("menu.tunnel.disconnected")
        }

        let allRunning = serverRunning && playwrightRunning
        if allRunning {
            statusMenuItem.title = tunnelURL != nil ? L("menu.status.running.online") : L("menu.status.running.local")
            statusItem.button?.image = NSImage(systemSymbolName: "server.rack", accessibilityDescription: L("a11y.status.running"))
        } else if serverRunning || playwrightRunning {
            statusMenuItem.title = L("menu.status.partial")
            statusItem.button?.image = NSImage(systemSymbolName: "exclamationmark.triangle", accessibilityDescription: L("a11y.status.partial"))
        } else {
            statusMenuItem.title = L("menu.status.idle")
            statusItem.button?.image = NSImage(systemSymbolName: "xmark.circle", accessibilityDescription: L("a11y.status.stopped"))
        }
        statusItem.button?.image?.isTemplate = true
    }

    // MARK: - Actions

    @objc private func toggleServer() {
        if processManager.isServerRunning { processManager.stopServer() }
        else { processManager.startServer() }
        updateMenuState()
    }

    @objc private func togglePlaywright() {
        if processManager.isPlaywrightRunning { processManager.stopPlaywright() }
        else { processManager.startPlaywright() }
        updateMenuState()
    }

    @objc private func toggleCaffeinate() {
        if processManager.isCaffeinateRunning { processManager.stopCaffeinate() }
        else { processManager.startCaffeinate() }
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
        let original = apiKeyMenuItem.title
        apiKeyMenuItem.title = L("menu.apikey.copied")
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
            self?.apiKeyMenuItem.title = original
        }
    }

    @objc private func toggleTunnel() {
        if processManager.isTunnelRunning { processManager.stopTunnel() }
        else { processManager.startQuickTunnel() }
        updateMenuState()
    }

    @objc private func copyTunnelURL() {
        guard let url = processManager.tunnelURL else {
            tunnelMenuItem.title = L("menu.tunnel.notrunning")
            return
        }
        let mcpURL = TunnelURLParser.mcpEndpoint(tunnelURL: url)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(mcpURL, forType: .string)
        let original = tunnelMenuItem.title
        tunnelMenuItem.title = L("menu.tunnel.copied.format", TunnelURLParser.displayURL(mcpURL))
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
            self?.tunnelMenuItem.title = original
        }
    }

    @objc private func tunnelURLDidChange(_ notification: Notification) {
        updateMenuState()
    }

    @objc private func openLogs() {
        NSWorkspace.shared.open(URL(fileURLWithPath: Config.shared.logDir))
    }

    @objc private func openConfig() {
        settingsWindow.show()
    }

    @objc private func setupPermissions() {
        PermissionChecker.showPermissionDialog()
    }

    @objc private func installProfile() {
        PermissionChecker.installProfile()
    }

    @objc private func quit() {
        processManager.stopAll()
        NSApplication.shared.terminate(nil)
    }
}
