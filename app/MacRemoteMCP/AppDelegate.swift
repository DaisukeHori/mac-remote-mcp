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

        NotificationCenter.default.addObserver(
            self, selector: #selector(tunnelURLDidChange(_:)),
            name: .tunnelURLChanged, object: nil
        )

        buildMenu()

        if Config.shared.autoStart {
            processManager.startAll()
            updateMenuState()
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        processManager.stopAll()
    }

    // MARK: - メニュー構築

    private func buildMenu() {
        let menu = NSMenu()

        // ステータス
        statusMenuItem = NSMenuItem(title: "状態：停止中", action: nil, keyEquivalent: "")
        statusMenuItem.isEnabled = false
        menu.addItem(statusMenuItem)

        // APIキー
        apiKeyMenuItem = NSMenuItem(title: "APIキー：読込中...", action: #selector(copyApiKey), keyEquivalent: "k")
        menu.addItem(apiKeyMenuItem)

        menu.addItem(NSMenuItem.separator())

        // MCPサーバー
        toggleServerMenuItem = NSMenuItem(title: "▶ MCPサーバーを起動", action: #selector(toggleServer), keyEquivalent: "s")
        menu.addItem(toggleServerMenuItem)

        // Playwright
        togglePlaywrightMenuItem = NSMenuItem(title: "▶ Playwrightを起動", action: #selector(togglePlaywright), keyEquivalent: "p")
        menu.addItem(togglePlaywrightMenuItem)

        // スリープ防止
        toggleCaffeinateMenuItem = NSMenuItem(title: "▶ スリープ防止を開始", action: #selector(toggleCaffeinate), keyEquivalent: "c")
        menu.addItem(toggleCaffeinateMenuItem)

        menu.addItem(NSMenuItem.separator())

        // トンネル
        tunnelMenuItem = NSMenuItem(title: "🌐 トンネル：未接続", action: nil, keyEquivalent: "")
        tunnelMenuItem.isEnabled = false
        menu.addItem(tunnelMenuItem)

        toggleTunnelMenuItem = NSMenuItem(title: "▶ クイックトンネル開始（無料）", action: #selector(toggleTunnel), keyEquivalent: "t")
        menu.addItem(toggleTunnelMenuItem)

        let copyURLItem = NSMenuItem(title: "MCP URLをコピー", action: #selector(copyTunnelURL), keyEquivalent: "u")
        menu.addItem(copyURLItem)

        menu.addItem(NSMenuItem.separator())

        // 全体操作
        let startAllItem = NSMenuItem(title: "すべて起動", action: #selector(startAll), keyEquivalent: "r")
        menu.addItem(startAllItem)

        let stopAllItem = NSMenuItem(title: "すべて停止", action: #selector(stopAll), keyEquivalent: "x")
        menu.addItem(stopAllItem)

        menu.addItem(NSMenuItem.separator())

        // ログ・設定
        let logsItem = NSMenuItem(title: "ログを開く...", action: #selector(openLogs), keyEquivalent: "l")
        menu.addItem(logsItem)

        let configItem = NSMenuItem(title: "設定を編集...", action: #selector(openConfig), keyEquivalent: ",")
        menu.addItem(configItem)

        menu.addItem(NSMenuItem.separator())

        // 終了
        let quitItem = NSMenuItem(title: "MacRemoteMCPを終了", action: #selector(quit), keyEquivalent: "q")
        menu.addItem(quitItem)

        statusItem.menu = menu

        apiKeyMenuItem.title = "APIキー：\(Config.shared.apiKey.prefix(8))...（クリックでコピー）"

        updateMenuState()
    }

    // MARK: - メニュー状態更新

    private func updateMenuState() {
        let serverRunning = processManager.isServerRunning
        let playwrightRunning = processManager.isPlaywrightRunning
        let caffeinateRunning = processManager.isCaffeinateRunning
        let tunnelRunning = processManager.isTunnelRunning
        let tunnelURL = processManager.tunnelURL

        toggleServerMenuItem.title = serverRunning ? "⏹ MCPサーバーを停止" : "▶ MCPサーバーを起動"
        togglePlaywrightMenuItem.title = playwrightRunning ? "⏹ Playwrightを停止" : "▶ Playwrightを起動"
        toggleCaffeinateMenuItem.title = caffeinateRunning ? "⏹ スリープ防止を解除" : "▶ スリープ防止を開始"
        toggleTunnelMenuItem.title = tunnelRunning ? "⏹ トンネルを停止" : "▶ クイックトンネル開始（無料）"

        if let url = tunnelURL {
            tunnelMenuItem.title = "🌐 \(TunnelURLParser.displayURL(url))"
        } else if tunnelRunning {
            tunnelMenuItem.title = "🌐 トンネル：接続中..."
        } else {
            tunnelMenuItem.title = "🌐 トンネル：未接続"
        }

        let allRunning = serverRunning && playwrightRunning
        if allRunning {
            statusMenuItem.title = tunnelURL != nil ? "● 稼働中 — オンライン公開中" : "● 稼働中（ローカルのみ）"
            statusItem.button?.image = NSImage(systemSymbolName: "server.rack", accessibilityDescription: "稼働中")
        } else if serverRunning || playwrightRunning {
            statusMenuItem.title = "◐ 一部稼働中"
            statusItem.button?.image = NSImage(systemSymbolName: "exclamationmark.triangle", accessibilityDescription: "一部")
        } else {
            statusMenuItem.title = "○ 停止中"
            statusItem.button?.image = NSImage(systemSymbolName: "xmark.circle", accessibilityDescription: "停止")
        }
        statusItem.button?.image?.isTemplate = true
    }

    // MARK: - アクション

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
        apiKeyMenuItem.title = "✓ クリップボードにコピーしました"
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
            tunnelMenuItem.title = "🌐 トンネル未稼働"
            return
        }
        let mcpURL = TunnelURLParser.mcpEndpoint(tunnelURL: url)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(mcpURL, forType: .string)
        let original = tunnelMenuItem.title
        tunnelMenuItem.title = "✓ コピー完了：\(TunnelURLParser.displayURL(mcpURL))"
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
        let envFile = Config.shared.installDir + "/.env"
        if FileManager.default.fileExists(atPath: envFile) {
            NSWorkspace.shared.open(URL(fileURLWithPath: envFile))
        } else {
            let alert = NSAlert()
            alert.messageText = ".envファイルが見つかりません"
            alert.informativeText = "初回はアプリ起動時に自動生成されます。\nまたは scripts/setup.sh を実行してください。"
            alert.runModal()
        }
    }

    @objc private func quit() {
        processManager.stopAll()
        NSApplication.shared.terminate(nil)
    }
}
