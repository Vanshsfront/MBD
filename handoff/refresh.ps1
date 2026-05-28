# handoff/refresh.ps1
#
# Re-copy the live design source into handoff/design/ so the bundle stays
# in sync with the codebase. Run after meaningful changes to src/components/
# or src/app/globals.css. Idempotent (only overwrites; no deletions).
#
# Usage from repo root:
#   .\handoff\refresh.ps1

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path "$PSScriptRoot\..").Path
$bundle = Join-Path $repoRoot "handoff"

function Ensure-Dir($path) {
    if (-not (Test-Path $path)) {
        New-Item -ItemType Directory -Force -Path $path | Out-Null
    }
}

function Copy-One($src, $dst) {
    Ensure-Dir (Split-Path -Parent $dst)
    Copy-Item -LiteralPath $src -Destination $dst -Force
}

function Copy-Folder($src, $dst, $filter = "*.tsx") {
    Ensure-Dir $dst
    Get-ChildItem -LiteralPath $src -Filter $filter | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $dst $_.Name) -Force
    }
}

# 1. DESIGN_HANDOFF.md at repo root → bundle
Copy-One `
    -src (Join-Path $repoRoot "DESIGN_HANDOFF.md") `
    -dst (Join-Path $bundle "design\DESIGN_HANDOFF.md")

# 2. globals.css — the canonical design tokens
Copy-One `
    -src (Join-Path $repoRoot "src\app\globals.css") `
    -dst (Join-Path $bundle "design\globals.css")

# 3. All Radix-based primitives
Copy-Folder `
    -src (Join-Path $repoRoot "src\components\ui") `
    -dst (Join-Path $bundle "design\components-ui") `
    -filter "*.tsx"

# 4. Layout shell + chrome
Copy-Folder `
    -src (Join-Path $repoRoot "src\components\layout") `
    -dst (Join-Path $bundle "design\layout") `
    -filter "*.tsx"

Write-Output "handoff/design/ refreshed from src/"
Write-Output "  DESIGN_HANDOFF.md"
Write-Output "  globals.css"
$uiCount = (Get-ChildItem (Join-Path $bundle "design\components-ui") -Filter "*.tsx" -ErrorAction SilentlyContinue).Count
$layoutCount = (Get-ChildItem (Join-Path $bundle "design\layout") -Filter "*.tsx" -ErrorAction SilentlyContinue).Count
Write-Output "  components-ui/ ($uiCount files)"
Write-Output "  layout/ ($layoutCount files)"
