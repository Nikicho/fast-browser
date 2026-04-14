param(
  [string]$Site
)

$ErrorActionPreference = 'Stop'

function Read-Json([string]$Text) {
  if ([string]::IsNullOrWhiteSpace($Text)) {
    return $null
  }
  return $Text | ConvertFrom-Json
}

$workspace = Read-Json (fast-browser workspace --json)

if ([string]::IsNullOrWhiteSpace($Site)) {
  $list = Read-Json (fast-browser list --json)
  [pscustomobject]@{
    workspace = $workspace
    adapters = $list
  } | ConvertTo-Json -Depth 8
  exit 0
}

$list = Read-Json (fast-browser list --json)
$info = Read-Json (fast-browser info $Site --json)
$flows = Read-Json (fast-browser flow list $Site --json)
$cases = Read-Json (fast-browser case list $Site --json)

[pscustomobject]@{
  workspace = $workspace
  site = $Site
  adapters = $list
  info = $info
  flows = $flows
  cases = $cases
} | ConvertTo-Json -Depth 10
