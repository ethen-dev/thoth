param(
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Say($Message) {
  Write-Host $Message
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoDir = Resolve-Path (Join-Path $ScriptDir "..\..")
$SourceDir = Join-Path $RepoDir "opencode\agents"
$DefaultTargetDir = Join-Path $HOME ".config\opencode\agents"
$TargetDir = if ($env:OPENCODE_AGENTS_DIR) { $env:OPENCODE_AGENTS_DIR } else { $DefaultTargetDir }

Say "T.H.O.T.H. OpenCode agent installer"
Say "Agent source: $SourceDir"
Say "Agent target: $TargetDir"

if (-not (Test-Path $SourceDir)) {
  Say "Cannot find OpenCode agents at $SourceDir"
  exit 1
}

if ($DryRun) {
  Say "DRY RUN: New-Item -ItemType Directory -Force $TargetDir"
  Say "DRY RUN: Copy-Item $SourceDir\*.md $TargetDir"
} else {
  New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
  Copy-Item -Path (Join-Path $SourceDir "*.md") -Destination $TargetDir -Force
}

Say "OpenCode agent installation finished."
Say "Restart OpenCode, then select or mention the thoth-memory agent."
