import Foundation

/// Shorthand for a localized lookup in Localizable.strings.
/// macOS picks the matching .lproj (en.lproj / ja.lproj) based on the user's
/// System Settings → General → Language & Region preference, falling back to
/// English (the declared CFBundleDevelopmentRegion) when neither matches.
///
/// Pass format arguments for keys whose value contains `%@`/`%d` placeholders.
func L(_ key: String, _ args: CVarArg...) -> String {
    let format = NSLocalizedString(key, bundle: .main, comment: "")
    return args.isEmpty ? format : String(format: format, arguments: args)
}
