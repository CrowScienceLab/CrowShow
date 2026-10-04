[CmdletBinding()]
param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$taskRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$taskMakeAppx = 'C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\makeappx.exe'
if (-not (Test-Path -LiteralPath $taskMakeAppx)) { throw 'Windows SDK MakeAppx is required.' }
Push-Location $taskRoot
try {
    if (-not $SkipBuild) {
        & npm.cmd run tauri:build -- --no-bundle --features microsoft-store --config src-tauri/tauri.store.conf.json
        if ($LASTEXITCODE -ne 0) { throw 'Store build failed.' }
    }
    $taskStage = Join-Path $taskRoot ('tmp\store-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path (Join-Path $taskStage 'Assets') -Force | Out-Null
    Copy-Item -LiteralPath 'src-tauri\target\release\crowshow.exe' -Destination $taskStage
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'AppxManifest.xml') -Destination $taskStage
    Add-Type -AssemblyName System.Drawing
    $taskIcon = [System.Drawing.Image]::FromFile((Join-Path $taskRoot 'public\crowshow-player-icon.png'))
    try {
        foreach ($taskLogo in @(@(50,50,'StoreLogo.png'),@(44,44,'Square44x44Logo.png'),@(150,150,'Square150x150Logo.png'),@(310,150,'Wide310x150Logo.png'),@(310,310,'Square310x310Logo.png'))) {
            $taskBitmap = [System.Drawing.Bitmap]::new($taskLogo[0], $taskLogo[1])
            $taskGraphics = [System.Drawing.Graphics]::FromImage($taskBitmap)
            try {
                $taskGraphics.Clear([System.Drawing.Color]::Transparent)
                $taskGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                $taskSide = [int]([Math]::Min($taskLogo[0],$taskLogo[1]) * 0.92)
                $taskGraphics.DrawImage($taskIcon, [int](($taskLogo[0]-$taskSide)/2), [int](($taskLogo[1]-$taskSide)/2), $taskSide, $taskSide)
                $taskBitmap.Save((Join-Path $taskStage ('Assets\'+$taskLogo[2])), [System.Drawing.Imaging.ImageFormat]::Png)
            } finally { $taskGraphics.Dispose(); $taskBitmap.Dispose() }
        }
    } finally { $taskIcon.Dispose() }
    New-Item -ItemType Directory -Force -Path (Join-Path $taskRoot 'release') | Out-Null
    $taskOutput = Join-Path $taskRoot 'release\CrowShow-v1.2-Store-x64.msix'
    if (Test-Path -LiteralPath $taskOutput) { throw 'Archive the previous Store package before rebuilding.' }
    & $taskMakeAppx pack /v /h SHA256 /d $taskStage /p $taskOutput
    if ($LASTEXITCODE -ne 0) { throw 'MakeAppx validation failed.' }
    Get-FileHash -LiteralPath $taskOutput -Algorithm SHA256
    Write-Output "Staging: $taskStage"
} finally { Pop-Location }
