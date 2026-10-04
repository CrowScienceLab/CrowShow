# CrowShow Microsoft Store submission

Date: 2026-10-04

- Product: CrowShow / Store ID `9N2G0ST27LBW`
- Submission: `1152921505702038692`
- Package: `release/CrowShow-v1.2-Store-x64.msix`, version `1.2.0.0`, x64
- SHA256: `a620a24e325799935e19867c7dbc56f776308e82615f3d7364eb25795daba473`
- User uploaded package; Partner Center validated it.
- User approved free pricing, Korea only, immediate release after certification.
- Korean listing uses three actual app screenshots from the original demo PDF in `store/assets`.
- Privacy policy: repository `PRIVACY.md`.

## Store build

`store/package-store.ps1` builds with the `microsoft-store` Cargo feature and a separate Tauri identifier. Store editions do not check for or download GitHub installer updates. Updates are provided by Microsoft Store. Existing GitHub profiles are separate; export/import projects for transfer.

Package targets Windows 10 version 2004 or newer and Windows 11. Requires installed Microsoft Edge WebView2 Runtime. The package uses `runFullTrust` for its Tauri desktop executable, local file handling and presentation windows.

## Validation

Frontend build and lint, Rust formatting and tests with the Store feature, and existing regression checks passed. MakeAppx packaging validation passed. Store package validation passed. Three 1920×1080 screenshots were captured from the built frontend with a headless local Edge session and visually inspected. This does not constitute an installed-MSIX launch test.

The GitHub v1.2.0 NSIS installer and its checksums remain unchanged.

## Publication status

Pricing, properties, age ratings and packages show Complete. Korean listing and reviewer instructions are being finalized. Certification has not yet been submitted; publication requires Microsoft approval.
