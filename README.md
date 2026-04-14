# mac-remote-mcp

Claude.ai / Claude Code からMacをリモート操作するための統合MCPサーバー。

シェル実行、GUI操作（スクリーンショット・マウス・キーボード）、UI要素操作、ファイル管理、アプリ制御を1つのサーバーで提供。Cloudflare Tunnel経由でインターネットから安全にアクセス可能。

## アーキテクチャ

```
Claude.ai ──HTTPS──► Cloudflare Tunnel ──► Mac (localhost)
                      + Bearer認証            ├─ mac-remote-mcp :3000  (34ツール)
                                              ├─ Playwright MCP :3001  (ブラウザ)
                                              └─ Auth Proxy    :3002  (Playwright認証)
```

## 機能一覧（34ツール）

| カテゴリ | ツール | 説明 |
|---|---|---|
| **Shell** | `shell_execute` | tmuxセッション永続シェル実行 |
| | `shell_execute_simple` | ワンショットコマンド実行 |
| | `shell_list_sessions` | アクティブセッション一覧 |
| | `shell_kill_session` | セッション終了 |
| **GUI** | `gui_screenshot` | スクリーンキャプチャ（リサイズ対応） |
| | `gui_mouse_click` | 座標クリック（左/右/ダブル） |
| | `gui_mouse_move` | マウス移動 |
| | `gui_mouse_scroll` | スクロール |
| | `gui_keyboard_type` | テキスト入力（Unicode対応） |
| | `gui_keyboard_key` | キー/ショートカット送信 |
| | `gui_get_mouse_position` | マウス座標取得 |
| | `gui_get_screen_size` | 画面解像度取得 |
| **UI要素** | `ui_get_elements` | アクセシビリティツリー取得 |
| | `ui_click_element` | 名前/ロール指定クリック |
| | `ui_set_value` | テキストフィールド値設定 |
| | `ui_get_focused` | フォーカス中の要素取得 |
| **ファイル** | `file_read` | ファイル読み込み |
| | `file_write` | ファイル書き込み |
| | `file_list` | ディレクトリ一覧 |
| | `file_delete` | ファイル削除（ゴミ箱対応） |
| | `file_move` | ファイル移動/リネーム |
| **アプリ** | `app_open` | アプリ起動 |
| | `app_quit` | アプリ終了（強制終了対応） |
| | `app_list_running` | 実行中アプリ一覧 |
| | `app_activate` | アプリをフォアグラウンドに |
| | `app_list_windows` | ウィンドウ一覧 |
| | `clipboard_get` | クリップボード取得 |
| | `clipboard_set` | クリップボード設定 |
| | `app_open_url` | URL をブラウザで開く |
| **管理** | `admin_status` | サーバー状態確認 |
| | `admin_kill_switch` | 緊急停止 |
| | `admin_caffeinate` | スリープ防止制御 |
| | `admin_view_log` | 監査ログ閲覧 |

## セキュリティ

- **Bearer トークン認証** — 全リクエストにAPIキー必須
- **危険コマンド検知** — `rm -rf /`, `mkfs`, `dd`, `shutdown`, `reboot`, `curl|sh` 等を自動ブロック
- **監査ログ** — 全ツール呼び出しをJSONLで記録（`~/.mac-remote-mcp/logs/`）
- **緊急停止** — `admin_kill_switch` で全セッション即座に終了
- **Cloudflare Tunnel** — ポート公開なし、暗号化通信

## クイックスタート

### 前提条件

- macOS 10.15+
- Node.js 20+
- tmux (`brew install tmux`)
- Cloudflare アカウント + cloudflared

### セットアップ

```bash
git clone https://github.com/DaisukeHori/mac-remote-mcp.git
cd mac-remote-mcp
chmod +x scripts/setup.sh
./scripts/setup.sh
```

セットアップスクリプトが以下を自動実行:
1. 依存関係インストール & ビルド
2. APIキー生成
3. Playwright Chromiumインストール
4. LaunchAgent登録（自動起動）
5. サービス起動

### macOS権限設定（手動）

System Settings → Privacy & Security で以下を付与:

1. **Accessibility** — Terminal/iTerm2 + node
2. **Screen Recording** — Terminal/iTerm2 + node
3. **Automation** — Terminal が全アプリを制御可能に
4. **Full Disk Access**（任意） — node

### Cloudflare Tunnel設定

```bash
# トンネル作成
cloudflared tunnel create mac-remote
cloudflared tunnel route dns mac-remote mac-ctrl.yourdomain.com
cloudflared tunnel route dns mac-remote mac-browser.yourdomain.com

# 設定ファイル
cp cloudflare/config.example.yml ~/.cloudflared/config.yml
# → tunnel IDとドメインを編集

# 起動
cloudflared tunnel run mac-remote
```

### Claude.ai に登録

1. Claude.ai → 設定 → コネクター → カスタムコネクターを追加
2. URL: `https://mac-ctrl.yourdomain.com/mcp`
3. 認証: Bearer `<APIキー>`

## 手動起動（LaunchAgent不使用）

```bash
# .envを読み込み
source .env

# Mac操作サーバー
TRANSPORT=http PORT=3000 MCP_API_KEY=$MCP_API_KEY node dist/index.js

# Playwright MCP（別ターミナル）
npx @playwright/mcp --port 3001 --host 127.0.0.1 --caps core,vision,devtools

# Playwright認証プロキシ（別ターミナル）
PLAYWRIGHT_PORT=3001 PROXY_PORT=3002 MCP_API_KEY=$MCP_API_KEY node dist/playwright-proxy/index.js
```

## テスト

```bash
npm test              # 全673テスト実行
npm run test:unit     # 単体テスト 273
npm run test:integration  # 結合テスト 400
npm run test:coverage # カバレッジ付き
```

## ログ

```
~/.mac-remote-mcp/logs/
├── audit-2024-01-15.log      # ツール呼び出し監査ログ（JSONL）
├── server.stdout.log         # サーバー標準出力
├── server.stderr.log         # サーバーエラー出力
├── playwright.stdout.log
└── playwright-proxy.stderr.log
```

## ロードマップ

- [ ] Phase 2: macOSメニューバーアプリ化（.app）
- [ ] Phase 3: Playwright MCP統合（単一サーバー化）
- [ ] OCR対応（画面テキスト座標特定）

## ライセンス

MIT
