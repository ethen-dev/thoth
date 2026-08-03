param(
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Say($Message) {
  Write-Host $Message
}

function Run($Command, $Arguments) {
  if ($DryRun) {
    Say "DRY RUN: $Command $($Arguments -join ' ')"
  } else {
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "$Command failed with exit code $LASTEXITCODE"
    }
  }
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoDir = Resolve-Path (Join-Path $ScriptDir "..\..")
$DefaultHome = Join-Path ([Environment]::GetFolderPath("MyDocuments")) "Thoth"
$ThothHome = if ($env:THOTH_HOME) { $env:THOTH_HOME } else { $DefaultHome }
$WorkspaceDir = Join-Path $ThothHome "workspace"
$WikiDir = Join-Path $ThothHome "wiki"

Say "T.H.O.T.H. Windows installer"
Say "Workspace: $WorkspaceDir"
Say "Wiki: $WikiDir"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Say "Node.js is required. Install it from https://nodejs.org/ and run this installer again."
  exit 1
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Say "npm is required. It is normally included with Node.js."
  exit 1
}

if ($DryRun) {
  Say "DRY RUN: New-Item -ItemType Directory -Force $WorkspaceDir $WikiDir"
} else {
  New-Item -ItemType Directory -Force -Path $WorkspaceDir, $WikiDir | Out-Null
}

if ($DryRun) {
  Say "DRY RUN: would install dependencies and build T.H.O.T.H. in $RepoDir"
  Say "DRY RUN: would install T.H.O.T.H. globally from $RepoDir"
} else {
  Push-Location $RepoDir
  try {
    Run "npm" @("install")
    Run "npm" @("run", "build")
  } finally {
    Pop-Location
  }
  Run "npm" @("install", "-g", $RepoDir.Path)
}

$ConfigPath = Join-Path $WorkspaceDir "thoth.config.json"
if ($DryRun) {
  Say "DRY RUN: would write $ConfigPath"
} else {
@'
{
  "wikiPath": "../wiki"
}
'@ | Set-Content -Path $ConfigPath -Encoding UTF8
}

if ($DryRun) {
  Say "DRY RUN: would run thoth init and thoth doctor"
} else {
  Push-Location $WorkspaceDir
  try {
    Run "thoth" @("init")
    Run "thoth" @("doctor")
  } finally {
    Pop-Location
  }
}

Say "T.H.O.T.H. installation finished."
Say "OpenCode can use this workspace: $WorkspaceDir"
