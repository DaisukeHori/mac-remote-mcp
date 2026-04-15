import Cocoa

class TunnelSetupWizard {

    // MARK: - Public Entry Point

    static func run(completion: @escaping (String?) -> Void) {
        // Step 1: Get API Token
        guard let apiToken = askApiToken() else { completion(nil); return }

        // Step 2: List zones, pick domain
        guard let zones = fetchZones(apiToken: apiToken) else {
            let testData = cfAPI(path: "/client/v4/zones?per_page=1", apiToken: apiToken)
            showError("ドメイン一覧の取得に失敗しました。\n\n" + extractError(from: testData))
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
        let tunnelResult = createTunnelWithError(apiToken: apiToken, accountId: accountId, name: tunnelName)
        guard let tunnel = tunnelResult.tunnel else {
            showError("トンネルの作成に失敗しました。\n\n" + extractError(from: tunnelResult.rawResponse))
            completion(nil); return
        }

        // Step 5: Configure DNS
        let dnsResult = cfAPI(
            path: "/client/v4/zones/\(zone.id)/dns_records",
            apiToken: apiToken,
            method: "POST",
            body: [
                "type": "CNAME",
                "name": hostname,
                "content": "\(tunnel.id).cfargotunnel.com",
                "proxied": true,
                "comment": "MacRemoteMCP tunnel"
            ]
        )
        let dnsOk = dnsResult?["success"] as? Bool ?? false
        if !dnsOk {
            showError("DNS設定に失敗しました。\n\n" + extractError(from: dnsResult))
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
        // Save token and hostname to .env
        let envPath = Config.shared.configDir + "/.env"
        if var contents = try? String(contentsOfFile: envPath, encoding: .utf8) {
            if let range = contents.range(of: "CLOUDFLARE_TUNNEL_TOKEN=.*", options: .regularExpression) {
                contents.replaceSubrange(range, with: "CLOUDFLARE_TUNNEL_TOKEN=\(token)")
            } else {
                contents += "CLOUDFLARE_TUNNEL_TOKEN=\(token)\n"
            }
            if let range = contents.range(of: "TUNNEL_HOSTNAME=.*", options: .regularExpression) {
                contents.replaceSubrange(range, with: "TUNNEL_HOSTNAME=\(hostname)")
            } else {
                contents += "TUNNEL_HOSTNAME=\(hostname)\n"
            }
            try? contents.write(toFile: envPath, atomically: true, encoding: .utf8)
        }

        let alert = NSAlert()
        alert.alertStyle = .informational
        alert.messageText = "固定URLの設定が完了しました！"
        alert.informativeText = """
        URL: https://\(hostname)
        MCP: https://\(hostname)/mcp

        「再起動」を押すと新しい設定で起動します。
        """
        alert.addButton(withTitle: "再起動")
        alert.runModal()

        completion(token)

        // Relaunch
        SettingsWindow.relaunchApp()
    }

    // MARK: - Step 1: API Token

    private static func askApiToken() -> String? {
        let alert = NSAlert()
        alert.messageText = "Step 1: Cloudflare APIトークンを作成"
        alert.informativeText = """
        まだトークンを持っていない場合：
        ━━━━━━━━━━━━━━━━━━━━━━
        ① 下の「Cloudflareを開く」をクリック
        ② 「カスタムトークンを作成する」の横の
            「始める」ボタンをクリック
        ③ トークン名に適当な名前を入力
            （例: MAC-MCP）
        ④ 「権限」の欄に以下の4行を追加：
            アカウント ／ Cloudflare Tunnel ／ 編集
            アカウント ／ アカウント設定 ／ 読み取り
            ゾーン ／ DNS ／ 編集
            ゾーン ／ ゾーン ／ 読み取り
        ⑤ 下の「概要に進む」をクリック
        ⑥ 「トークンを作成する」をクリック
        ⑦ 表示された cfut_xxxxx... をコピー
        ━━━━━━━━━━━━━━━━━━━━━━
        コピーしたトークンを下に貼り付けてください。
        """
        alert.addButton(withTitle: "次へ")
        alert.addButton(withTitle: "Cloudflareを開く")
        alert.addButton(withTitle: "キャンセル")

        let input = NSTextField(frame: NSRect(x: 0, y: 0, width: 400, height: 24))
        input.placeholderString = "ここにトークンを貼り付け（cfut_で始まる文字列）"
        input.font = NSFont.monospacedSystemFont(ofSize: 12, weight: .regular)
        alert.accessoryView = input

        let response = alert.runModal()
        if response == .alertSecondButtonReturn {
            NSWorkspace.shared.open(URL(string: "https://dash.cloudflare.com/profile/api-tokens")!)
            return askApiToken()
        }
        guard response == .alertFirstButtonReturn else { return nil }

        let token = input.stringValue.trimmingCharacters(in: .whitespaces)
        if token.isEmpty {
            showError("トークンが入力されていません。\nCloudflareの画面で「トークンを作成する」を押すと\ncfut_で始まる文字列が表示されます。\nそれをコピーして貼り付けてください。")
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
            showError("Cloudflareにドメインが登録されていません。\n先にCloudflareのダッシュボードでドメインを追加してください。\n\nhttps://dash.cloudflare.com")
            return nil
        }

        let alert = NSAlert()
        alert.messageText = "Step 2: ドメインを選択"
        alert.informativeText = "MacRemoteMCPの固定URLに使うドメインを選んでください。\n\n例: appserver.tokyo を選ぶと\n→ mac-remote.appserver.tokyo のようなURLになります。"
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
        alert.messageText = "Step 3: サブドメインを決める"
        alert.informativeText = """
        好きなサブドメイン名を入力してください。

        例: 「mac-remote」と入力すると
        → https://mac-remote.\(domain)
        　にアクセスできるようになります。

        ※ 英数字とハイフンのみ使えます
        """
        alert.addButton(withTitle: "作成する！")
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
        return createTunnelWithError(apiToken: apiToken, accountId: accountId, name: name).tunnel
    }

    private static func createTunnelWithError(apiToken: String, accountId: String, name: String) -> (tunnel: Tunnel?, rawResponse: [String: Any]?) {
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        let secret = Data(bytes).base64EncodedString()

        let body: [String: Any] = [
            "name": name,
            "tunnel_secret": secret,
            "config_src": "cloudflare"
        ]

        let data = cfAPI(
            path: "/client/v4/accounts/\(accountId)/cfd_tunnel",
            apiToken: apiToken,
            method: "POST",
            body: body
        )

        guard let data = data,
              let result = data["result"] as? [String: Any],
              let id = result["id"] as? String,
              let rname = result["name"] as? String else {
            return (nil, data)
        }
        return (Tunnel(id: id, name: rname), data)
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
        var args = ["-s", "-X", method, url,
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
        task.arguments = args
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

    /// Extract error message from Cloudflare API response and translate common ones to Japanese
    static func extractError(from data: [String: Any]?) -> String {
        guard let data = data else {
            return "Cloudflareに接続できませんでした。\nインターネット接続を確認してください。"
        }

        if let errors = data["errors"] as? [[String: Any]] {
            let messages = errors.compactMap { error -> String? in
                let code = error["code"] as? Int ?? 0
                let msg = error["message"] as? String ?? "不明なエラー"
                return translateError(code: code, message: msg)
            }
            if !messages.isEmpty {
                return messages.joined(separator: "\n")
            }
        }

        if let success = data["success"] as? Bool, !success {
            return "Cloudflare APIがエラーを返しました。\nAPIトークンの権限を確認してください。"
        }

        return "不明なエラーが発生しました。"
    }

    private static func translateError(code: Int, message: String) -> String {
        // Common Cloudflare error translations
        let lower = message.lowercased()
        if lower.contains("authentication") || lower.contains("unauthorized") || code == 10000 {
            return "認証エラー: APIトークンが無効です。\n新しいトークンを作成してください。"
        }
        if lower.contains("permission") || lower.contains("forbidden") {
            return "権限エラー: このAPIトークンに必要な権限がありません。\nTunnel/DNS/Zone/Account設定の権限を確認してください。"
        }
        if lower.contains("already exists") || lower.contains("duplicate") {
            return "既に存在するエラー: 同じ名前のリソースが既に作成されています。\n別の名前を試すか、Cloudflareダッシュボードで確認してください。"
        }
        if lower.contains("not found") {
            return "見つかりません: 指定されたリソースが存在しません。"
        }
        if lower.contains("rate limit") {
            return "レート制限: リクエストが多すぎます。少し待ってから再試行してください。"
        }
        if lower.contains("record already exists") || code == 81057 || code == 81058 {
            return "DNSレコードが既に存在します。\n別のサブドメインを試すか、Cloudflareダッシュボードで既存のレコードを削除してください。"
        }
        // Return original with code
        return "エラー(\(code)): \(message)"
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
