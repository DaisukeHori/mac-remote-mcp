import Cocoa

class SettingsWindow: NSObject, NSWindowDelegate {
    private var window: NSWindow?

    func show() {
        if let w = window, w.isVisible { w.makeKeyAndOrderFront(nil); return }

        let w = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 520, height: 480),
            styleMask: [.titled, .closable, .miniaturizable],
            backing: .buffered, defer: false
        )
        w.title = "MacRemoteMCP 設定"
        w.center()
        w.delegate = self
        w.isReleasedWhenClosed = false
        w.contentView = buildContent()
        w.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        window = w
    }

    private func buildContent() -> NSView {
        let container = NSView(frame: NSRect(x: 0, y: 0, width: 520, height: 480))

        var y = 440

        // ── Title ──
        let title = makeLabel("MacRemoteMCP 設定", size: 18, bold: true)
        title.frame = NSRect(x: 20, y: y, width: 480, height: 28)
        container.addSubview(title)
        y -= 40

        // ── API Key ──
        let apiLabel = makeLabel("APIキー", size: 13, bold: true)
        apiLabel.frame = NSRect(x: 20, y: y, width: 100, height: 20)
        container.addSubview(apiLabel)
        y -= 28

        let apiField = NSTextField(frame: NSRect(x: 20, y: y, width: 380, height: 24))
        apiField.stringValue = Config.shared.apiKey
        apiField.isEditable = false
        apiField.font = NSFont.monospacedSystemFont(ofSize: 11, weight: .regular)
        apiField.tag = 100
        container.addSubview(apiField)

        let copyBtn = NSButton(frame: NSRect(x: 410, y: y, width: 90, height: 24))
        copyBtn.title = "コピー"
        copyBtn.bezelStyle = .rounded
        copyBtn.target = self
        copyBtn.action = #selector(copyApiKey)
        container.addSubview(copyBtn)
        y -= 36

        // ── Ports ──
        let portsLabel = makeLabel("ポート設定", size: 13, bold: true)
        portsLabel.frame = NSRect(x: 20, y: y, width: 200, height: 20)
        container.addSubview(portsLabel)
        y -= 28

        let portLabels = ["MCPサーバー", "Playwright", "認証プロキシ"]
        let portValues = [Config.shared.serverPort, Config.shared.playwrightPort, Config.shared.proxyPort]
        let portKeys = ["PORT", "PLAYWRIGHT_PORT", "PROXY_PORT"]

        for i in 0..<3 {
            let label = makeLabel(portLabels[i], size: 12, bold: false)
            label.frame = NSRect(x: 40, y: y, width: 120, height: 20)
            container.addSubview(label)

            let field = NSTextField(frame: NSRect(x: 170, y: y, width: 80, height: 22))
            field.integerValue = portValues[i]
            field.font = NSFont.monospacedSystemFont(ofSize: 12, weight: .regular)
            field.tag = 201 + i
            container.addSubview(field)

            let keyLabel = makeLabel(portKeys[i], size: 10, bold: false)
            keyLabel.textColor = .secondaryLabelColor
            keyLabel.frame = NSRect(x: 260, y: y, width: 150, height: 20)
            container.addSubview(keyLabel)
            y -= 28
        }
        y -= 8

        // ── Auto Start ──
        let autoCheck = NSButton(checkboxWithTitle: "アプリ起動時に全サービスを自動開始", target: nil, action: nil)
        autoCheck.frame = NSRect(x: 20, y: y, width: 300, height: 20)
        autoCheck.state = Config.shared.autoStart ? .on : .off
        autoCheck.tag = 300
        container.addSubview(autoCheck)
        y -= 36

        // ── Permission Status ──
        let permLabel = makeLabel("権限の状態", size: 13, bold: true)
        permLabel.frame = NSRect(x: 20, y: y, width: 200, height: 20)
        container.addSubview(permLabel)
        y -= 26

        let accStatus = PermissionChecker.checkAccessibility()
        let scrStatus = PermissionChecker.checkScreenRecording()

        let perms = [
            ("アクセシビリティ", accStatus),
            ("画面収録", scrStatus),
        ]

        for (name, granted) in perms {
            let icon = granted ? "✅" : "❌"
            let status = makeLabel("\(icon) \(name)", size: 12, bold: false)
            status.frame = NSRect(x: 40, y: y, width: 200, height: 18)
            container.addSubview(status)

            if !granted {
                let fixBtn = NSButton(frame: NSRect(x: 250, y: y - 2, width: 100, height: 22))
                fixBtn.title = "設定を開く"
                fixBtn.bezelStyle = .rounded
                fixBtn.font = NSFont.systemFont(ofSize: 11)
                fixBtn.target = self
                if name == "アクセシビリティ" {
                    fixBtn.action = #selector(openAccessibility)
                } else {
                    fixBtn.action = #selector(openScreenRecording)
                }
                container.addSubview(fixBtn)
            }
            y -= 24
        }
        y -= 16

        // ── Buttons ──
        let saveBtn = NSButton(frame: NSRect(x: 310, y: 16, width: 90, height: 32))
        saveBtn.title = "保存"
        saveBtn.bezelStyle = .rounded
        saveBtn.keyEquivalent = "\r"
        saveBtn.target = self
        saveBtn.action = #selector(saveSettings(_:))
        container.addSubview(saveBtn)

        let cancelBtn = NSButton(frame: NSRect(x: 410, y: 16, width: 90, height: 32))
        cancelBtn.title = "閉じる"
        cancelBtn.bezelStyle = .rounded
        cancelBtn.keyEquivalent = "\u{1b}"
        cancelBtn.target = self
        cancelBtn.action = #selector(closeWindow)
        container.addSubview(cancelBtn)

        let envBtn = NSButton(frame: NSRect(x: 20, y: 16, width: 160, height: 32))
        envBtn.title = ".envファイルを直接編集"
        envBtn.bezelStyle = .rounded
        envBtn.font = NSFont.systemFont(ofSize: 11)
        envBtn.target = self
        envBtn.action = #selector(openEnvFile)
        container.addSubview(envBtn)

        return container
    }

    // MARK: - Helpers

    private func makeLabel(_ text: String, size: CGFloat, bold: Bool) -> NSTextField {
        let label = NSTextField(labelWithString: text)
        label.font = bold ? NSFont.boldSystemFont(ofSize: size) : NSFont.systemFont(ofSize: size)
        return label
    }

    // MARK: - Actions

    @objc private func copyApiKey() {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(Config.shared.apiKey, forType: .string)
    }

    @objc private func openAccessibility() {
        PermissionChecker.openAccessibilitySettings()
    }

    @objc private func openScreenRecording() {
        PermissionChecker.openScreenRecordingSettings()
    }

    @objc private func openEnvFile() {
        let envFile = Config.shared.configDir + "/.env"
        if FileManager.default.fileExists(atPath: envFile) {
            NSWorkspace.shared.open(URL(fileURLWithPath: envFile))
        }
    }

    @objc private func saveSettings(_ sender: Any) {
        guard let contentView = window?.contentView else { return }

        var envVars: [String: String] = [:]
        envVars["MCP_API_KEY"] = Config.shared.apiKey

        // Read port fields
        let portKeys = ["PORT", "PLAYWRIGHT_PORT", "PROXY_PORT"]
        for i in 0..<3 {
            if let field = contentView.viewWithTag(201 + i) as? NSTextField {
                envVars[portKeys[i]] = String(field.integerValue)
            }
        }

        // Auto start
        if let check = contentView.viewWithTag(300) as? NSButton {
            envVars["AUTO_START"] = check.state == .on ? "true" : "false"
        }

        // Save to .env
        let envPath = Config.shared.configDir + "/.env"
        var lines = ["# mac-remote-mcp configuration", ""]
        for key in ["MCP_API_KEY", "PORT", "PLAYWRIGHT_PORT", "PROXY_PORT", "AUTO_START"] {
            if let val = envVars[key] {
                lines.append("\(key)=\(val)")
            }
        }
        lines.append("")
        try? lines.joined(separator: "\n").write(toFile: envPath, atomically: true, encoding: .utf8)

        let alert = NSAlert()
        alert.messageText = "設定を保存しました"
        alert.informativeText = "変更を反映するにはアプリを再起動してください。"
        alert.runModal()
    }

    @objc private func closeWindow() {
        window?.close()
    }
}
