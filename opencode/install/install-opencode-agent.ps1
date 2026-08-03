param(
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Say($Message) {
  Write-Host $Message
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoDir = Resolve-Path (Join-Path $ScriptDir "..\..")
$SourceAgent = Join-Path $RepoDir "opencode\agents\thoth-memory.md"
$DefaultTargetDir = Join-Path $HOME ".config\opencode\agents"
$TargetDir = if ($env:OPENCODE_AGENTS_DIR) { $env:OPENCODE_AGENTS_DIR } else { $DefaultTargetDir }
$TargetAgent = Join-Path $TargetDir "thoth-memory.md"

Say "T.H.O.T.H. OpenCode agent installer"
Say "Agent source: $SourceAgent"
Say "Agent target: $TargetAgent"

if (-not (Test-Path $SourceAgent)) {
  Say "Cannot find thoth-memory agent at $SourceAgent"
  exit 1
}

if ($DryRun) {
  Say "DRY RUN: New-Item -ItemType Directory -Force $TargetDir"
  Say "DRY RUN: Copy-Item $SourceAgent $TargetAgent"
} else {
  New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
  Copy-Item -Path $SourceAgent -Destination $TargetAgent -Force
}

Say "OpenCode agent installation finished."
Say "Restart OpenCode, then select or mention the thoth-memory agent."
