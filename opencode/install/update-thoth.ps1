param(
  [switch]$DryRun,
  [switch]$SkipPull
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
$InstallThoth = Join-Path $ScriptDir "install-thoth.ps1"
$InstallAgent = Join-Path $ScriptDir "install-opencode-agent.ps1"

Say "T.H.O.T.H. Windows updater"
Say "Repository: $RepoDir"

if (-not $SkipPull -and (Test-Path (Join-Path $RepoDir ".git"))) {
  Run "git" @("-C", $RepoDir.Path, "pull", "--ff-only")
} elseif ($SkipPull) {
  Say "Skipping git pull."
} else {
  Say "Repository is not a Git checkout; skipping git pull."
}

if ($DryRun) {
  Run "powershell" @("-ExecutionPolicy", "Bypass", "-File", $InstallThoth, "-DryRun")
  Run "powershell" @("-ExecutionPolicy", "Bypass", "-File", $InstallAgent, "-DryRun")
} else {
  Run "powershell" @("-ExecutionPolicy", "Bypass", "-File", $InstallThoth)
  Run "powershell" @("-ExecutionPolicy", "Bypass", "-File", $InstallAgent)
}

Say "T.H.O.T.H. update finished. Restart OpenCode to reload agents."
