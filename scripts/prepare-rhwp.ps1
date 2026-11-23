param([string]$Archive, [string]$SourceDirectory)

$ErrorActionPreference = 'Stop'
$rhwpVersion = '0.9.1'
$sourceCommit = '981ce66b4183b13c1a3b5907e04a8969c8c42034'
$archiveHash = '2214C5B07408F18417E450E6E8F44A9F0A4CD917B09839F3EC3577BA19945C9C'
$executableHash = '9DDF57BA8A6888D4B9EE36A29188189334B8F0D7901496A60473BF401643A24B'
$project = Split-Path -Parent $PSScriptRoot
$vendor = Join-Path $project 'src-tauri\vendor'
$runtime = Join-Path $vendor 'rhwp'
$executable = Join-Path $runtime 'rhwp.exe'
$patch = Join-Path $PSScriptRoot 'patches\rhwp-0.9.1-column-layout.patch'
$bundledPatch = Join-Path $runtime ([IO.Path]::GetFileName($patch))
$buildRecord = Join-Path $vendor 'rhwp-build.txt'

function Get-Sha256([string]$Path) {
    $stream = [IO.File]::OpenRead((Resolve-Path -LiteralPath $Path).Path)
    $hash = [Security.Cryptography.SHA256]::Create()
    try {
        [BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-', '')
    } finally {
        $hash.Dispose()
        $stream.Dispose()
    }
}

$patchHash = Get-Sha256 $patch
if ((Test-Path -LiteralPath $executable -PathType Leaf) -and
    (Test-Path -LiteralPath $buildRecord -PathType Leaf) -and
    (Test-Path -LiteralPath $bundledPatch -PathType Leaf) -and
    (Test-Path -LiteralPath (Join-Path $runtime 'LICENSE') -PathType Leaf) -and
    (Test-Path -LiteralPath (Join-Path $runtime 'notices\THIRD_PARTY_LICENSES.md') -PathType Leaf)) {
    $record = [IO.File]::ReadAllLines($buildRecord)
    if ($record.Count -eq 3 -and $record[0] -eq $sourceCommit -and
        $record[1] -eq $patchHash -and $record[2] -eq (Get-Sha256 $executable) -and
        (Get-Sha256 $bundledPatch) -eq $patchHash) {
        return
    }
}

New-Item -ItemType Directory -Force -Path $vendor | Out-Null
$staging = Join-Path $vendor ('.rhwp-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $staging | Out-Null
try {
    if (!$Archive) {
        $Archive = Join-Path $staging 'rhwp.zip'
        $tag = "v$rhwpVersion"
        $client = [Net.WebClient]::new()
        try {
            $client.DownloadFile(
                "https://github.com/edwardkim/rhwp/releases/download/$tag/rhwp-$tag-windows-x86_64.zip",
                $Archive
            )
        } finally {
            $client.Dispose()
        }
    }
    if ((Get-Sha256 $Archive) -ne $archiveHash) {
        throw "The rhwp $rhwpVersion archive did not match its pinned SHA-256."
    }
    $expanded = Join-Path $staging 'expanded'
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::ExtractToDirectory((Resolve-Path -LiteralPath $Archive).Path, $expanded)
    $payload = Join-Path $expanded 'rhwp'
    if ((Get-Sha256 (Join-Path $payload 'rhwp.exe')) -ne $executableHash) {
        throw "The rhwp $rhwpVersion executable did not match its pinned SHA-256."
    }
    if ($SourceDirectory) {
        $source = (Resolve-Path -LiteralPath $SourceDirectory).Path
    } else {
        $source = Join-Path $staging 'source'
        & git -c core.longpaths=true clone --depth 1 --branch "v$rhwpVersion" --filter=blob:none --sparse https://github.com/edwardkim/rhwp.git $source
        if ($LASTEXITCODE -ne 0) { throw 'Could not fetch the pinned rhwp source.' }
        $sourcePaths = @('src', 'assets', 'vendor', 'crates', 'tools', 'bindings', 'saved', 'tests', 'data', 'ttfs', 'mydocs/manual', 'mydocs/tech/agent_roadmap')
        & git -c core.longpaths=true -C $source sparse-checkout set @sourcePaths
        if ($LASTEXITCODE -ne 0) { throw 'Could not check out the rhwp build inputs.' }
    }
    $head = & git -C $source rev-parse HEAD
    if ($LASTEXITCODE -ne 0 -or $head -ne $sourceCommit) {
        throw "Unexpected rhwp source commit. Expected $sourceCommit."
    }
    & git -C $source apply --reverse --check $patch 2>$null
    if ($LASTEXITCODE -ne 0) {
        & git -C $source apply $patch
        if ($LASTEXITCODE -ne 0) { throw 'Could not apply the CrowShow layout patch.' }
    }
    $target = Join-Path $source 'target'
    Push-Location $source
    try {
        & cargo '+stable' build --locked --bin rhwp --profile release-test --target-dir $target
        if ($LASTEXITCODE -ne 0) { throw 'Could not build the patched rhwp converter.' }
    } finally {
        Pop-Location
    }
    $patchedExecutable = Join-Path $target 'release-test\rhwp.exe'
    New-Item -ItemType Directory -Force -Path $runtime | Out-Null
    Copy-Item -LiteralPath (Join-Path $payload 'LICENSE') -Destination $runtime -Force
    Copy-Item -LiteralPath (Join-Path $payload 'notices') -Destination $runtime -Recurse -Force
    Copy-Item -LiteralPath $patch -Destination $runtime -Force
    Copy-Item -LiteralPath $patchedExecutable -Destination $executable -Force
    [IO.File]::WriteAllLines($buildRecord, [string[]]@($sourceCommit, $patchHash, (Get-Sha256 $executable)))
} finally {
    $resolvedStaging = (Resolve-Path -LiteralPath $staging).Path
    $resolvedVendor = (Resolve-Path -LiteralPath $vendor).Path
    if ([IO.Path]::GetDirectoryName($resolvedStaging) -eq $resolvedVendor) {
        Remove-Item -LiteralPath $resolvedStaging -Recurse -Force
    }
}
