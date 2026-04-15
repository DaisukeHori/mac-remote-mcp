# MacRemoteMCP

Claude.ai / Claude Code から Mac をリモート操作するための macOS メニューバーアプリ + MCP サーバー。

ワンクリックで全サービスを起動し、Cloudflare Tunnel 経由で世界中どこからでも安全にMacを操作できます。

## 特徴

- **メニューバーアプリ** — DMGからドラッグ&ドロップでインストール、メニューバーから全操作
- **34のMCPツール** — シェル実行、GUI操作、ファイル管理、アプリ制御
- **Cloudflare Tunnel統合** — 固定URL対応、ポート公開不要
- **設定ウィンドウ** — APIキー管理、ポート設定、権限状態確認、Cloudflareセットアップウィザード
- **Apple Developer ID署名 + 公証（Notarization）** — Gatekeeperに対応

## アーキテクチャ

```
Claude.ai ──HTTPS──► Cloudflare Tunnel（固定URL or Quick Tunnel）
                      + Bearer認証
                          │
                     Mac (localhost)
                      ├─ MacRemoteMCP.app（メニューバー常駐）
                      ├─ MCPサーバー  :3000（34ツール）
                      ├─ Playwright   :3001（ブラウザ自動操作）
                      ├─ 認証プロキシ  :3002（Playwright用Bearer認証）
                      ├─ caffeinate   （スリープ防止）
                      └─ cloudflared  （Cloudflare Tunnel）
```

## インストール

### 方法1: DMGからインストール（推奨）

1. [Releases](https://github.com/DaisukeHori/mac-remote-mcp/releases) から最新の `MacRemoteMCP.dmg` をダウンロード
2. DMGをダブルクリック → `MacRemoteMCP.app` を `Applications` にドラッグ
3. `MacRemoteMCP.app` を起動

### 方法2: ソースからビルド

```bash
git clone https://github.com/DaisukeHori/mac-remote-mcp.git
cd mac-remote-mcp
npm install && npm run build
cd app && chmod +x build.sh && ./build.sh
```

### 必要なもの

- macOS 13.0 以上
- Node.js 20 以上（`brew install node`）
- tmux（`brew install tmux`）
- cloudflared（`brew install cloudflared`）— Tunnel使用時のみ

## 初回セットアップ

### 1. 権限の設定

アプリ初回起動時にダイアログが表示されます。以下の権限を許可してください：

| 権限 | 用途 | 自動設定 |
|---|---|---|
| **アクセシビリティ** | マウス・キーボード操作、UI要素取得 | PPPC構成プロファイルで可 |
| **画面収録** | スクリーンショット取得 | ❌ 手動のみ（Apple制限） |
| **Automation** | アプリ制御（System Events） | PPPC構成プロファイルで可 |
| **フルディスクアクセス** | ファイル読み書き（任意） | PPPC構成プロファイルで可 |

> **注意:** 権限を変更したあとは **アプリの再起動が必要** です（macOSの仕様でプロセス単位のキャッシュが更新されないため）。

### 2. Claude.aiに登録

1. メニューバーの MacRemoteMCP アイコンをクリック
2. 「すべて起動」をクリック
3. 「MCP URLをコピー」をクリック
4. Claude.ai → 設定 → コネクター → カスタムコネクター追加
5. URL にコピーしたURLを貼り付け
6. 認証: Bearer → メニューのAPIキーをコピーして貼り付け

## メニュー構成

```
● 稼働中 — オンライン公開中
APIキー：xxxx...（クリックでコピー）
────────────────────
▶ MCPサーバーを起動
▶ Playwrightを起動
▶ スリープ防止を開始
────────────────────
🌐 トンネル：https://mac-remote.example.com
▶ 固定トンネル開始 / クイックトンネル開始（無料）
MCP URLをコピー
────────────────────
すべて起動
すべて停止
────────────────────
ログを開く...
設定を編集...
権限を設定...
構成プロファイルをインストール...
────────────────────
MacRemoteMCPを終了
```

## 設定ウィンドウ

「設定を編集...」から開く設定ウィンドウでは以下を管理できます：

- **APIキー** — 表示・コピー・再生成（ローテーション）
- **ポート設定** — MCPサーバー / Playwright / 認証プロキシ
- **自動起動** — アプリ起動時に全サービスを自動開始
- **Cloudflare Tunnel** — トンネルトークン入力 or セットアップウィザード
- **権限の状態** — アクセシビリティ / 画面収録 の ✅/❌ 表示 + 設定画面へのリンク

> 保存ボタンを押すと `.env` に書き込み後、アプリが自動再起動します。

## Cloudflare Tunnel 固定URLセットアップ

### 方法1: アプリ内ウィザード（推奨）

1. 設定ウィンドウを開く
2. 「固定URLをセットアップ...」をクリック
3. ウィザードの指示に従う：
   - Cloudflare APIトークンを作成（ブラウザが自動で開きます）
   - ドメインを選択
   - サブドメインを入力（例: `mac-remote`）
4. 自動でトンネル作成 → DNS設定 → トークン保存 → アプリ再起動

### 方法2: 手動設定

```bash
# トンネル作成
cloudflared tunnel create mac-remote-mcp
cloudflared tunnel route dns mac-remote-mcp mac-remote.yourdomain.com

# トークン取得
cloudflared tunnel token mac-remote-mcp

# 設定ウィンドウの「Tunnel Token」欄にトークンを貼り付け → 保存
```

### 方法3: Quick Tunnel（無料、ランダムURL）

Tunnel Token を空のままにすると、毎回ランダムURLが自動生成されます。テスト用途に最適。

## ツール一覧（34ツール）

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
| | `file_info` | ファイル情報取得 |
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
- **危険コマンド検知** — `rm -rf /`, `mkfs`, `dd`, `shutdown`, `reboot`, `curl|sh` 等18パターンを自動ブロック（`confirm_dangerous=true` でオーバーライド可）
- **監査ログ** — 全ツール呼び出しをJSONLで日別記録
- **緊急停止** — `admin_kill_switch` で全セッション即座に終了
- **Cloudflare Tunnel** — ポート公開なし、TLS暗号化
- **APIキーローテーション** — 設定ウィンドウから即座に再生成可能

## テスト

```bash
npm test                  # 全673テスト実行
npm run test:unit         # 単体テスト 273
npm run test:integration  # 結合テスト 400
```

Swiftテスト（ロジック102テスト）:
```bash
cd app && swift Tests/TestRunner.swift
```

## 設定ファイル

```
~/.mac-remote-mcp/
├── .env                  # 設定ファイル（APIキー、ポート、トンネル等）
└── logs/
    ├── app.log           # アプリログ
    ├── audit-YYYY-MM-DD.log  # 監査ログ（JSONL）
    ├── server.stdout.log
    ├── server.stderr.log
    └── tunnel.stderr.log
```

### .env の設定項目

```bash
MCP_API_KEY=xxxx                    # APIキー（自動生成）
PORT=3000                           # MCPサーバーポート
PLAYWRIGHT_PORT=3001                # Playwrightポート
PROXY_PORT=3002                     # 認証プロキシポート
AUTO_START=false                    # 全サービス自動開始
CLOUDFLARE_TUNNEL_TOKEN=            # トンネルトークン（空欄=Quick Tunnel）
TUNNEL_HOSTNAME=                    # 固定URL用ホスト名
```

## 開発で得た教訓 — Apple Notarization

このプロジェクトのNotarization対応で遭遇した問題と解決策を記録します。

### 問題1: 「The signature of the binary is invalid」

**症状:** `codesign --verify --strict` はローカルで通るのに、Apple Notarization Serviceが拒否する。

**原因:** 二段階署名でSealed Resourcesが壊れる。

```bash
# ❌ ダメ: メインバイナリ→バンドルの二段階署名
codesign --sign "..." App.app/Contents/MacOS/App  # 1
codesign --sign "..." App.app                     # 2 ← これが1の署名を壊す
```

**解決:** 単一パスで`--deep`付きで署名。

```bash
# ✅ 正しい: 単一パス署名
codesign --force --deep --options runtime --timestamp \
  --entitlements Entitlements.plist \
  --sign "Developer ID Application: ..." App.app
```

### 問題2: DMG内の署名破損

**原因:** `cp -r` はmacOSの拡張属性を保持しない。

```bash
# ❌ cp -r → 署名が壊れる
# ✅ ditto → 署名・拡張属性を保持
ditto App.app dmg-contents/App.app
ditto -c -k --keepParent App.app App.zip
```

### 問題3: Entitlements未指定

node.jsを子プロセスとして実行するため、以下のentitlementsが必要：

```xml
<key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
<key>com.apple.security.cs.disable-library-validation</key><true/>
<key>com.apple.security.automation.apple-events</key><true/>
```

### 問題4: 初回Notarization送信の長時間待ち

初めてのDeveloper IDからの送信では、Appleが精密検査を行い数時間〜24時間かかる。一度Acceptedされれば以降は1〜2分。

### 問題5: NSTextField.integerValueのカンマ問題

`integerValue = 3000` → 表示「3,000」→ 読み戻し「3」。`stringValue`を使うこと。

## CI/CD

- **CI** (`ci.yml`): pushごとにNode.js 20/22テスト + Swiftコンパイルチェック
- **Release** (`release.yml`): タグ `v*` → テスト → ビルド → Developer ID署名 → Notarization → DMG+ZIP → GitHub Release

## ライセンス

MIT
