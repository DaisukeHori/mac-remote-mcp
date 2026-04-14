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

    func applicationDidFinishLaunching(_ notification: Notification) {
        processManager = ProcessManager()

        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)

        if let button = statusItem.button {
            button.image = NSImage(systemSymbolName: "server.rack", accessibilityDescription: "MCP")
            button.image?.isTemplate = true
        }

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

        toggleServerMenuItem.title = serverRunning ? "⏹ Stop MCP Server" : "▶ Start MCP Server"
        togglePlaywrightMenuItem.title = playwrightRunning ? "⏹ Stop Playwright" : "▶ Start Playwright"
        toggleCaffeinateMenuItem.title = caffeinateRunning ? "⏹ Stop Caffeinate" : "▶ Start Caffeinate"

        let allRunning = serverRunning && playwrightRunning
        if allRunning {
            statusMenuItem.title = "● All Running"
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
