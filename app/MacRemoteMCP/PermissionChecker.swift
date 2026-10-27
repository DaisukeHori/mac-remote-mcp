import Cocoa
import ApplicationServices
import UniformTypeIdentifiers

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
        if !status.accessibility { missing.append(L("permission.accessibility")) }
        if !status.screenRecording { missing.append(L("permission.screenrecording")) }

        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = L("permission.alert.title")
        alert.informativeText = L(
            "permission.alert.body.format",
            missing.map { L("permission.alert.item.format", $0) }.joined(separator: "\n")
        )
        alert.addButton(withTitle: L("permission.button.opensettings"))
        alert.addButton(withTitle: L("permission.button.later"))

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
        // Check bundle first
        let bundlePath = Bundle.main.bundlePath
        let bundleProfilePath = bundlePath + "/Contents/Resources/MacRemoteMCP-Permissions.mobileconfig"

        if FileManager.default.fileExists(atPath: bundleProfilePath) {
            // Open the profile (triggers macOS "Profile Downloaded" dialog)
            NSWorkspace.shared.open(URL(fileURLWithPath: bundleProfilePath))

            // After a short delay, open System Settings > Profiles
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                if let url = URL(string: "x-apple.systempreferences:com.apple.preferences.configurationprofiles") {
                    NSWorkspace.shared.open(url)
                }
            }
            return
        }

        // Show Finder file picker if not in bundle
        let panel = NSOpenPanel()
        panel.title = L("permission.profile.panel.title")
        panel.message = L("permission.profile.panel.message")
        panel.allowedContentTypes = [UTType(filenameExtension: "mobileconfig") ?? .data]
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false

        if panel.runModal() == .OK, let url = panel.url {
            NSWorkspace.shared.open(url)
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                if let settingsURL = URL(string: "x-apple.systempreferences:com.apple.preferences.configurationprofiles") {
                    NSWorkspace.shared.open(settingsURL)
                }
            }
        }
    }
}
