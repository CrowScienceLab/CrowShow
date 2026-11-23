# Third-party notices

## Mozilla PDF.js and bundled PDF resources

CrowShow uses `pdfjs-dist` (Apache License 2.0). Its CMaps, standard fonts, WASM
decoders, and ICC profiles are copied from the installed package into `pdfjs/`
at build time for offline PDF rendering. The package LICENSE and each resource
directory's bundled license files are included with these resources.

- Project: https://github.com/mozilla/pdf.js
- Package license: installed `pdfjs-dist/LICENSE`, distributed as `pdfjs/LICENSE`
- Resource license notices: the corresponding `pdfjs/standard_fonts`, `pdfjs/wasm`, and `pdfjs/iccs` directories

## Google Material Icons — `touch_app`

CrowShow의 검지손가락 도형은 Google Material Icons의 `touch_app` SVG 경로를
좌우 방향 도형으로 변환하여 사용합니다.

- Project: https://github.com/google/material-design-icons
- Icon: `src/action/touch_app/materialicons/24px.svg`
- License: Apache License 2.0
- License text: https://www.apache.org/licenses/LICENSE-2.0

Copyright Google LLC. Licensed under the Apache License, Version 2.0.

## rhwp

CrowShow for Windows builds rhwp v0.9.1 with a local layout patch to convert
HWP and HWPX documents to PDF locally. rhwp is distributed under the MIT
License, copyright (c) 2025-2026 Edward Kim. The source patch is included
with the executable and is also available in `scripts/patches/`.

- Release: https://github.com/edwardkim/rhwp/releases/tag/v0.9.1
- License: distributed as `rhwp/LICENSE`
- Component and font notices: distributed under `rhwp/notices/`
