import Cocoa

class TunnelSetupWizard {

    // MARK: - Public Entry Point

    static func run(completion: @escaping (String?) -> Void) {
        // Step 1: Get API Token
        guard let apiToken = askApiToken() else { completion(nil); return }

        // Step 2: List zones, pick domain
        guard let zones = fetchZones(apiToken: apiToken) else {
            showError("ドメイン一覧の取得に失敗しました。\nAPIトークンを確認してください。")
            completion(nil); return
        }
        guard let zone = pickZone(zones: zones) else { completion(nil); return }

        // Step 3: Pick subdomain
        guard let subdomain = askSubdomain(domain: zone.name) else { completion(nil); return }
        let hostname = "\(subdomain).\(zone.name)"

        // Step 4: Create tunnel
        guard let accountId = fetchAccountId(apiToken: apiToken) else {
            showError("アカウントIDの取得に失敗しました。")
            completion(nil); return
        }

        let tunnelName = "mac-remote-mcp-\(subdomain)"
        guard let tunnel = createTunnel(apiToken: apiToken, accountId: accountId, name: tunnelName) else {
            showError("トンネルの作成に失敗しました。")
            completion(nil); return
        }

        // Step 5: Configure DNS
        let dnsOk = createDNS(apiToken: apiToken, zoneId: zone.id, hostname: hostname, tunnelId: tunnel.id)
        if !dnsOk {
            showError("DNS設定に失敗しました。\n\(hostname) が既に存在する可能性があります。")
        }

        // Step 6: Configure tunnel ingress
        let configOk = configureTunnel(apiToken: apiToken, accountId: accountId, tunnelId: tunnel.id, hostname: hostname)
        if !configOk {
            showError("トンネル設定に一部失敗しましたが、トークンは取得できています。")
        }

        // Step 7: Get tunnel token
        guard let token = getTunnelToken(apiToken: apiToken, accountId: accountId, tunnelId: tunnel.id) else {
            showError("トンネルトークンの取得に失敗しました。")
            completion(nil); return
        }

        // Success!
        let alert = NSAlert()
        alert.alertStyle = .informational
        alert.messageText = "固定URLの設定が完了しました！"
        alert.informativeText = """
        URL: https://\(hostname)
        MCP: https://\(hostname)/mcp

        トンネルトークンは自動保存されました。
        「保存」を押してからアプリを再起動してください。
        """
        alert.runModal()

        completion(token)
    }

    // MARK: - Step 1: API Token

    private static func askApiToken() -> String? {
        let alert = NSAlert()
        alert.messageText = "Cloudflare APIトークン"
        alert.informativeText = """
        Cloudflareの管理画面からAPIトークンを作成してください。

        1. 下の「トークンを作成」をクリック
        2.「カスタムトークンを作成」を選択
        3. 権限：
           ・Account / Cloudflare Tunnel / Edit
           ・Account / Account Settings / Read
           ・Zone / DNS / Edit
           ・Zone / Zone / Read
        4. 作成されたトークンをここに貼り付け
        """
        alert.addButton(withTitle: "次へ")
        alert.addButton(withTitle: "トークンを作成（ブラウザ）")
        alert.addButton(withTitle: "キャンセル")

        let input = NSTextField(frame: NSRect(x: 0, y: 0, width: 400, height: 24))
        input.placeholderString = "Cloudflare APIトークンを貼り付け"
        input.font = NSFont.monospacedSystemFont(ofSize: 12, weight: .regular)
        alert.accessoryView = input

        let response = alert.runModal()
        if response == .alertSecondButtonReturn {
            NSWorkspace.shared.open(URL(string: "https://dash.cloudflare.com/profile/api-tokens")!)
            // Show again after browser opens
            return askApiToken()
        }
        guard response == .alertFirstButtonReturn else { return nil }

        let token = input.stringValue.trimmingCharacters(in: .whitespaces)
        guard !token.isEmpty else {
            showError("APIトークンが入力されていません。")
            return nil
        }
        return token
    }

    // MARK: - Step 2: Zone Selection

    struct Zone { let id: String; let name: String }

    private static func fetchZones(apiToken: String) -> [Zone]? {
        guard let data = cfAPI(path: "/client/v4/zones?per_page=50", apiToken: apiToken) else { return nil }
        guard let result = data["result"] as? [[String: Any]] else { return nil }
        return result.compactMap { item in
            guard let id = item["id"] as? String, let name = item["name"] as? String else { return nil }
            return Zone(id: id, name: name)
        }
    }

    private static func pickZone(zones: [Zone]) -> Zone? {
        if zones.isEmpty {
            showError("Cloudflareにドメインが登録されていません。\n先にドメインを追加してください。")
            return nil
        }

        let alert = NSAlert()
        alert.messageText = "ドメインを選択"
        alert.informativeText = "固定URLに使用するドメインを選択してください。"
        alert.addButton(withTitle: "次へ")
        alert.addButton(withTitle: "キャンセル")

        let popup = NSPopUpButton(frame: NSRect(x: 0, y: 0, width: 300, height: 28))
        for zone in zones {
            popup.addItem(withTitle: zone.name)
        }
        alert.accessoryView = popup

        guard alert.runModal() == .alertFirstButtonReturn else { return nil }
        let idx = popup.indexOfSelectedItem
        return idx >= 0 && idx < zones.count ? zones[idx] : nil
    }

    // MARK: - Step 3: Subdomain

    private static func askSubdomain(domain: String) -> String? {
        let alert = NSAlert()
        alert.messageText = "サブドメインを入力"
        alert.informativeText = "例: mac-remote → mac-remote.\(domain)"
        alert.addButton(withTitle: "作成")
        alert.addButton(withTitle: "キャンセル")

        let input = NSTextField(frame: NSRect(x: 0, y: 0, width: 300, height: 24))
        input.stringValue = "mac-remote"
        alert.accessoryView = input

        guard alert.runModal() == .alertFirstButtonReturn else { return nil }
        let sub = input.stringValue
            .trimmingCharacters(in: .whitespaces)
            .lowercased()
            .replacingOccurrences(of: " ", with: "-")
        guard !sub.isEmpty else {
            showError("サブドメインを入力してください。")
            return nil
        }
        return sub
    }

    // MARK: - Step 4-7: Cloudflare API Calls

    struct Tunnel { let id: String; let name: String }

    private static func fetchAccountId(apiToken: String) -> String? {
        guard let data = cfAPI(path: "/client/v4/accounts?per_page=1", apiToken: apiToken) else { return nil }
        guard let result = data["result"] as? [[String: Any]],
              let first = result.first,
              let id = first["id"] as? String else { return nil }
        return id
    }

    private static func createTunnel(apiToken: String, accountId: String, name: String) -> Tunnel? {
        // Generate tunnel secret
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        let secret = Data(bytes).base64EncodedString()

        let body: [String: Any] = [
            "name": name,
            "tunnel_secret": secret,
            "config_src": "cloudflare"
        ]

        guard let data = cfAPI(
            path: "/client/v4/accounts/\(accountId)/cfd_tunnel",
            apiToken: apiToken,
            method: "POST",
            body: body
        ) else { return nil }

        guard let result = data["result"] as? [String: Any],
              let id = result["id"] as? String,
              let rname = result["name"] as? String else { return nil }
        return Tunnel(id: id, name: rname)
    }

    private static func createDNS(apiToken: String, zoneId: String, hostname: String, tunnelId: String) -> Bool {
        let body: [String: Any] = [
            "type": "CNAME",
            "name": hostname,
            "content": "\(tunnelId).cfargotunnel.com",
            "proxied": true,
            "comment": "MacRemoteMCP tunnel"
        ]
        let data = cfAPI(
            path: "/client/v4/zones/\(zoneId)/dns_records",
            apiToken: apiToken,
            method: "POST",
            body: body
        )
        return data?["success"] as? Bool ?? false
    }

    private static func configureTunnel(apiToken: String, accountId: String, tunnelId: String, hostname: String) -> Bool {
        let port = Config.shared.serverPort
        let body: [String: Any] = [
            "config": [
                "ingress": [
                    ["hostname": hostname, "service": "http://localhost:\(port)"],
                    ["service": "http_status:404"]
                ]
            ]
        ]
        let data = cfAPI(
            path: "/client/v4/accounts/\(accountId)/cfd_tunnel/\(tunnelId)/configurations",
            apiToken: apiToken,
            method: "PUT",
            body: body
        )
        return data?["success"] as? Bool ?? false
    }

    private static func getTunnelToken(apiToken: String, accountId: String, tunnelId: String) -> String? {
        guard let data = cfAPI(
            path: "/client/v4/accounts/\(accountId)/cfd_tunnel/\(tunnelId)/token",
            apiToken: apiToken
        ) else { return nil }
        return data["result"] as? String
    }

    // MARK: - HTTP Helper

    private static func cfAPI(path: String, apiToken: String, method: String = "GET", body: [String: Any]? = nil) -> [String: Any]? {
        let url = "https://api.cloudflare.com\(path)"
        var args = ["curl", "-s", "-X", method, url,
                    "-H", "Authorization: Bearer \(apiToken)",
                    "-H", "Content-Type: application/json"]

        if let body = body {
            if let jsonData = try? JSONSerialization.data(withJSONObject: body),
               let jsonStr = String(data: jsonData, encoding: .utf8) {
                args += ["-d", jsonStr]
            }
        }

        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/bin/curl")
        task.arguments = Array(args.dropFirst()) // remove "curl" from args
        let pipe = Pipe()
        task.standardOutput = pipe
        task.standardError = Pipe()

        do {
            try task.run()
            task.waitUntilExit()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            return try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        } catch {
            return nil
        }
    }

    // MARK: - Helpers

    private static func showError(_ message: String) {
        let alert = NSAlert()
        alert.alertStyle = .critical
        alert.messageText = "エラー"
        alert.informativeText = message
        alert.runModal()
    }
}
