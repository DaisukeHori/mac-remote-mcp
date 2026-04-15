import Cocoa
import ApplicationServices

class PermissionChecker {

    struct PermissionStatus {
        let accessibility: Bool
        let screenRecording: Bool
        let allGranted: Bool
    }

    // MARK: - Check All Permissions

    static func checkAll() -> PermissionStatus {
        let acc = checkAccessibility()
        let scr = checkScreenRecording()
        return PermissionStatus(
            accessibility: acc,
            screenRecording: scr,
            allGranted: acc && scr
        )
    }

    // MARK: - Accessibility

    static func checkAccessibility() -> Bool {
        return AXIsProcessTrusted()
    }

    static func requestAccessibility() {
        let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue(): true] as CFDictionary
        AXIsProcessTrustedWithOptions(options)
    }

    // MARK: - Screen Recording

    static func checkScreenRecording() -> Bool {
        // CGWindowListCreateImage returns a valid image even without screen recording
        // on some macOS versions. Use CGPreflightScreenCaptureAccess on macOS 15+
        if #available(macOS 15, *) {
            return CGPreflightScreenCaptureAccess()
        }
        // Fallback: try creating a small screenshot
        let testImage = CGWindowListCreateImage(
            CGRect(x: 0, y: 0, width: 1, height: 1),
            .optionOnScreenOnly,
            kCGNullWindowID,
            .nominalResolution
        )
        return testImage != nil
    }

    static func openScreenRecordingSettings() {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture") {
            NSWorkspace.shared.open(url)
        }
    }

    static func openAccessibilitySettings() {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility") {
            NSWorkspace.shared.open(url)
        }
    }

    static func openAutomationSettings() {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation") {
            NSWorkspace.shared.open(url)
        }
    }

    // MARK: - Show Permission Dialog

    static func showPermissionDialog() {
        let status = checkAll()
        if status.allGranted { return }

        var missing: [String] = []
        if !status.accessibility { missing.append("アクセシビリティ") }
        if !status.screenRecording { missing.append("画面収録") }

        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = "権限の設定が必要です"
        alert.informativeText = """
        MacRemoteMCPの動作に以下の権限が必要です：

        \(missing.map { "・\($0) ❌" }.joined(separator: "\n"))

        「設定を開く」をクリックすると、
        必要な設定画面を順番に開きます。
        各画面でMacRemoteMCPまたはnodeをONにしてください。
        """
        alert.addButton(withTitle: "設定を開く")
        alert.addButton(withTitle: "後で設定")

        let response = alert.runModal()
        if response == .alertFirstButtonReturn {
            openMissingPermissions(status)
        }
    }

    private static func openMissingPermissions(_ status: PermissionStatus) {
        if !status.accessibility {
            requestAccessibility()
            // Small delay before opening next
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                if !status.screenRecording {
                    openScreenRecordingSettings()
                }
            }
        } else if !status.screenRecording {
            openScreenRecordingSettings()
        }
    }

    // MARK: - Install PPPC Profile

    static func installProfile() {
        let bundlePath = Bundle.main.bundlePath
        let profilePath = (bundlePath as NSString)
            .deletingLastPathComponent + "/MacRemoteMCP-Permissions.mobileconfig"

        // Also check inside app bundle
        let bundleProfilePath = bundlePath + "/Contents/Resources/MacRemoteMCP-Permissions.mobileconfig"

        let path: String
        if FileManager.default.fileExists(atPath: bundleProfilePath) {
            path = bundleProfilePath
        } else if FileManager.default.fileExists(atPath: profilePath) {
            path = profilePath
        } else {
            let alert = NSAlert()
            alert.messageText = "構成プロファイルが見つかりません"
            alert.informativeText = "MacRemoteMCP-Permissions.mobileconfig がアプリと同じフォルダにある必要があります。"
            alert.runModal()
            return
        }

        // Open profile installer
        NSWorkspace.shared.open(URL(fileURLWithPath: path))
    }
}
