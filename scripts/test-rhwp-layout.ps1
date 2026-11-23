param(
    [Parameter(Mandatory)][string]$Source,
    [string]$Converter = (Join-Path $PSScriptRoot '..\src-tauri\vendor\rhwp\rhwp.exe')
)

$ErrorActionPreference = 'Stop'
$sourcePath = (Resolve-Path -LiteralPath $Source).Path
$converterPath = (Resolve-Path -LiteralPath $Converter).Path
$output = New-Item -ItemType Directory -Force -Path (
    Join-Path (Split-Path -Parent $PSScriptRoot) ('tmp\rhwp-layout-test-' + [guid]::NewGuid().ToString('N'))
)
$env:RHWP_WEBFONT_OFFLINE = '1'
& $converterPath export-render-tree $sourcePath -o $output.FullName | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Render tree export failed.' }
$pages = @(Get-ChildItem -LiteralPath $output.FullName -Filter 'render_tree_*.json' | Sort-Object Name)
if ($pages.Count -ne 2) { throw "Expected two pages, got $($pages.Count)." }

# The electromagnetic interactions fixture has a banner, two question pictures
# and two answer lists on each page. Check the content before PDF rasterization.
$expectedPictureHosts = @(@(1, 9), @(36, 47))
$expectedQuestionHosts = @(@(2, 10), @(37, 48))
$expectedTableHosts = @(@(3, 11), @(38, 49))
function Get-RenderNodes($Node) {
    $Node
    foreach ($child in $Node.children) {
        Get-RenderNodes $child
    }
}
for ($index = 0; $index -lt $pages.Count; $index++) {
    $tree = Get-Content -LiteralPath $pages[$index].FullName -Encoding UTF8 -Raw | ConvertFrom-Json
    $column = ($tree.children | Where-Object type -eq 'Body').children[0]
    $pictures = @(Get-RenderNodes $column | Where-Object type -eq 'Image')
    foreach ($hostIndex in $expectedPictureHosts[$index]) {
        if ($hostIndex -notin $pictures.pi) {
            throw "Page $($index + 1) failed to render the picture in paragraph $hostIndex."
        }
    }
    $answerRows = @($column.children | Where-Object {
        $_.type -eq 'TextLine' -and ($_.children.text -join '') -like "*$([char]0x2460)*"
    })
    if ($answerRows.Count -ne 2) {
        throw "Page $($index + 1) expected two answer lists, got $($answerRows.Count)."
    }
    $lastAnswerRows = @($column.children | Where-Object {
        $_.type -eq 'TextLine' -and ($_.children.text -join '') -like "*$([char]0x2464)*"
    })
    if ($lastAnswerRows.Count -ne 2 -or @($lastAnswerRows | Where-Object {
        $_.bbox.y + $_.bbox.h -gt $tree.bbox.h
    }).Count) {
        throw "Page $($index + 1) lost the last answer of a list or placed it outside the page."
    }
    for ($question = 0; $question -lt 2; $question++) {
        $promptLines = @($column.children | Where-Object {
            $_.type -eq 'TextLine' -and $_.pi -eq $expectedQuestionHosts[$index][$question]
        })
        $table = $column.children | Where-Object {
            $_.type -eq 'Table' -and $_.pi -eq $expectedTableHosts[$index][$question]
        } | Select-Object -First 1
        if (!$promptLines.Count -or !$table) { throw "Page $($index + 1) lost a prompt or table." }
        $promptBottom = ($promptLines | ForEach-Object { $_.bbox.y + $_.bbox.h } |
            Measure-Object -Maximum).Maximum
        if ($table.bbox.y -lt ($promptBottom - 0.5)) {
            throw "Page $($index + 1) places a question prompt inside its table."
        }
    }
    if ($index -eq 1) {
        $banner = $pictures | Where-Object pi -eq 35 | Select-Object -First 1
        $opening = $column.children | Where-Object { $_.type -eq 'TextLine' -and $_.pi -eq 35 } |
            Select-Object -First 1
        if (!$banner -or !$opening -or ($banner.bbox.y + $banner.bbox.h) -gt $opening.bbox.y) {
            throw 'Page 2 banner obscures the opening lines.'
        }
    }
    Write-Output "Page $($index + 1): two pictures and answer lists, with separate prompts and tables."
}
