import Cocoa

class SettingsWindow: NSObject, NSWindowDelegate {
    private var window: NSWindow?
    private var apiField: NSTextField?

    func show() {
        if let w = window, w.isVisible { w.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true); return }

        // Temporarily show in dock so window can receive focus
        NSApp.setActivationPolicy(.regular)

        let w = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 520, height: 620),
            styleMask: [.titled, .closable, .miniaturizable],
            backing: .buffered, defer: false
        )
        w.title = "MacRemoteMCP 設定"
        w.center()
        w.delegate = self
        w.isReleasedWhenClosed = false
        w.level = .floating
        w.contentView = buildContent()
        w.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        // Reset level after activation so it doesn't stay always-on-top
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            w.level = .normal
        }
        window = w
    }

    private func buildContent() -> NSView {
        let container = NSView(frame: NSRect(x: 0, y: 0, width: 520, height: 620))

        var y = 580

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

        let apiFieldLocal = NSTextField(frame: NSRect(x: 20, y: y, width: 340, height: 24))
        apiFieldLocal.stringValue = Config.shared.apiKey
        apiFieldLocal.isEditable = false
        apiFieldLocal.font = NSFont.monospacedSystemFont(ofSize: 11, weight: .regular)
        apiFieldLocal.tag = 100
        container.addSubview(apiFieldLocal)
        self.apiField = apiFieldLocal

        let copyBtn = NSButton(frame: NSRect(x: 365, y: y, width: 65, height: 24))
        copyBtn.title = "コピー"
        copyBtn.bezelStyle = .rounded
        copyBtn.font = NSFont.systemFont(ofSize: 11)
        copyBtn.target = self
        copyBtn.action = #selector(copyApiKey)
        container.addSubview(copyBtn)

        let rotateBtn = NSButton(frame: NSRect(x: 435, y: y, width: 65, height: 24))
        rotateBtn.title = "再生成"
        rotateBtn.bezelStyle = .rounded
        rotateBtn.font = NSFont.systemFont(ofSize: 11)
        rotateBtn.target = self
        rotateBtn.action = #selector(rotateApiKey)
        container.addSubview(rotateBtn)
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

        // ── Cloudflare Tunnel ──
        let cfLabel = makeLabel("Cloudflare Tunnel（固定URL）", size: 13, bold: true)
        cfLabel.frame = NSRect(x: 20, y: y, width: 300, height: 20)
        container.addSubview(cfLabel)
        y -= 24

        let cfDesc = makeLabel("空欄＝無料Quick Tunnel（ランダムURL）。トークン入力で固定URL。", size: 10, bold: false)
        cfDesc.textColor = .secondaryLabelColor
        cfDesc.frame = NSRect(x: 20, y: y, width: 480, height: 16)
        container.addSubview(cfDesc)
        y -= 24

        let cfTokenLabel = makeLabel("Tunnel Token", size: 12, bold: false)
        cfTokenLabel.frame = NSRect(x: 40, y: y, width: 100, height: 20)
        container.addSubview(cfTokenLabel)

        let cfTokenField = NSTextField(frame: NSRect(x: 150, y: y, width: 350, height: 22))
        cfTokenField.stringValue = Config.shared.tunnelToken
        cfTokenField.placeholderString = "自動設定されます（手動入力も可）"
        cfTokenField.font = NSFont.monospacedSystemFont(ofSize: 10, weight: .regular)
        cfTokenField.tag = 400
        container.addSubview(cfTokenField)
        y -= 30

        let setupBtn = NSButton(frame: NSRect(x: 40, y: y, width: 220, height: 28))
        setupBtn.title = "固定URLをセットアップ..."
        setupBtn.bezelStyle = .rounded
        setupBtn.target = self
        setupBtn.action = #selector(runTunnelSetup)
        container.addSubview(setupBtn)

        let helpLabel = makeLabel("Cloudflareアカウントがあればボタン1つで完了", size: 10, bold: false)
        helpLabel.textColor = .secondaryLabelColor
        helpLabel.frame = NSRect(x: 270, y: y + 4, width: 230, height: 16)
        container.addSubview(helpLabel)
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
        NSPasteboard.general.setString(apiField?.stringValue ?? Config.shared.apiKey, forType: .string)
    }

    @objc private func rotateApiKey() {
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = "APIキーを再生成しますか？"
        alert.informativeText = "現在のキーは無効になります。\nClaude.aiのコネクター設定も更新が必要です。"
        alert.addButton(withTitle: "再生成")
        alert.addButton(withTitle: "キャンセル")
        let response = alert.runModal()
        guard response == .alertFirstButtonReturn else { return }

        // Generate new key
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        let newKey = bytes.map { String(format: "%02x", $0) }.joined()

        // Update .env file
        let envPath = Config.shared.configDir + "/.env"
        if var contents = try? String(contentsOfFile: envPath, encoding: .utf8) {
            if let range = contents.range(of: "MCP_API_KEY=.*", options: .regularExpression) {
                contents.replaceSubrange(range, with: "MCP_API_KEY=\(newKey)")
            } else {
                contents += "\nMCP_API_KEY=\(newKey)\n"
            }
            try? contents.write(toFile: envPath, atomically: true, encoding: .utf8)
        }

        // Update UI
        apiField?.stringValue = newKey

        // Copy to clipboard
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(newKey, forType: .string)

        let doneAlert = NSAlert()
        doneAlert.messageText = "APIキーを再生成しました"
        doneAlert.informativeText = "新しいキーがクリップボードにコピーされました。\nアプリを再起動すると新しいキーが適用されます。"
        doneAlert.runModal()
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

    @objc private func runTunnelSetup() {
        TunnelSetupWizard.run { [weak self] token in
            guard let token = token, let contentView = self?.window?.contentView else { return }
            // Update the token field in the UI
            if let field = contentView.viewWithTag(400) as? NSTextField {
                field.stringValue = token
            }
        }
    }

    @objc private func saveSettings(_ sender: Any) {
        guard let contentView = window?.contentView else { return }

        var envVars: [String: String] = [:]
        envVars["MCP_API_KEY"] = apiField?.stringValue ?? Config.shared.apiKey

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

        // Tunnel token
        if let field = contentView.viewWithTag(400) as? NSTextField {
            let token = field.stringValue.trimmingCharacters(in: .whitespaces)
            if !token.isEmpty {
                envVars["CLOUDFLARE_TUNNEL_TOKEN"] = token
            }
        }

        // Save to .env
        let envPath = Config.shared.configDir + "/.env"
        var lines = ["# mac-remote-mcp configuration", ""]
        for key in ["MCP_API_KEY", "PORT", "PLAYWRIGHT_PORT", "PROXY_PORT", "AUTO_START", "CLOUDFLARE_TUNNEL_TOKEN"] {
            if let val = envVars[key] {
                lines.append("\(key)=\(val)")
            }
        }
        lines.append("")
        try? lines.joined(separator: "\n").write(toFile: envPath, atomically: true, encoding: .utf8)

        // Auto-restart
        Self.relaunchApp()
    }

    static func relaunchApp() {
        let bundlePath = Bundle.main.bundlePath
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/bin/open")
        task.arguments = ["-n", bundlePath, "--args", "--relaunch"]
        try? task.run()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            NSApp.terminate(nil)
        }
    }

    @objc private func closeWindow() {
        window?.close()
        // Switch back to menu bar only (no dock icon)
        NSApp.setActivationPolicy(.accessory)
    }

    // NSWindowDelegate
    func windowWillClose(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
    }
}
