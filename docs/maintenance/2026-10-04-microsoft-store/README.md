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

All required sections completed, including the Korean listing with three screenshots. Reviewer instructions were saved under Additional Testing Information. Submission Options specifies publishing as soon as certification passes.

Partner Center accepted the submission on 2026-10-04 and shows **In certification**, with Submission complete and Pre-processing in progress. Publication has not yet completed; Microsoft approval is required. Evidence: `submission-status.png`.

Store URL after publication: https://apps.microsoft.com/detail/9N2G0ST27LBW

Packaging staging and temporary diagnostics were moved to `D:\App coding\_archive\CrowShow-2026-10-04-microsoft-store`.
