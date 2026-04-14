param(
  [int]$Limit = 20
)

$ErrorActionPreference = 'Stop'

function Read-Json([string]$Text) {
  if ([string]::IsNullOrWhiteSpace($Text)) {
    return $null
  }
  return $Text | ConvertFrom-Json
}

$status = Read-Json (fast-browser browser status --json)
$current = Read-Json (fast-browser trace current --json)
$latest = Read-Json (fast-browser trace latest $Limit --json)

[pscustomobject]@{
  browser = $status
  current = $current
  latest = $latest
} | ConvertTo-Json -Depth 12
