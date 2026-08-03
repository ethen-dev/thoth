#!/usr/bin/env bash
set -euo pipefail

DRY_RUN="no"
SKIP_PULL="no"

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN="yes" ;;
    --skip-pull) SKIP_PULL="yes" ;;
    *)
      printf 'Unknown option: %s\n' "$arg"
      printf 'Usage: update-thoth.sh [--dry-run] [--skip-pull]\n'
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
INSTALL_THOTH="$SCRIPT_DIR/install-thoth.sh"
INSTALL_AGENT="$SCRIPT_DIR/install-opencode-agent.sh"

say() {
  printf '%s\n' "$1"
}

run() {
  if [[ "$DRY_RUN" == "yes" ]]; then
    printf 'DRY RUN: %q' "$1"
    shift
    printf ' %q' "$@"
    printf '\n'
  else
    "$@"
  fi
}

say "T.H.O.T.H. Linux updater"
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
