#!/bin/zsh
set -euo pipefail

DRY_RUN="no"
SKIP_PULL="no"

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN="yes" ;;
    --skip-pull) SKIP_PULL="yes" ;;
    *)
      print -- "Unknown option: $arg"
      print -- "Usage: update-thoth.command [--dry-run] [--skip-pull]"
      exit 1
      ;;
  esac
done

SCRIPT_DIR="${0:A:h}"
REPO_DIR="${SCRIPT_DIR:h:h}"
INSTALL_THOTH="$SCRIPT_DIR/install-thoth.command"
INSTALL_AGENT="$SCRIPT_DIR/install-opencode-agent.command"

say() {
  print -- "$1"
}

run() {
  if [[ "$DRY_RUN" == "yes" ]]; then
    print -- "DRY RUN: $*"
  else
    "$@"
  fi
}

say "T.H.O.T.H. macOS updater"
say "Repository: $REPO_DIR"

if [[ "$SKIP_PULL" == "no" && -d "$REPO_DIR/.git" ]]; then
  run git -C "$REPO_DIR" pull --ff-only
elif [[ "$SKIP_PULL" == "yes" ]]; then
  say "Skipping git pull."
else
  say "Repository is not a Git checkout; skipping git pull."
fi

if [[ "$DRY_RUN" == "yes" ]]; then
  run "$INSTALL_THOTH" --dry-run
  run "$INSTALL_AGENT" --dry-run
else
  "$INSTALL_THOTH"
  "$INSTALL_AGENT"
fi

say "T.H.O.T.H. update finished. Restart OpenCode to reload agents."
