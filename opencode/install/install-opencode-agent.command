#!/bin/zsh
set -euo pipefail

DRY_RUN="no"
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN="yes"
fi

SCRIPT_DIR="${0:A:h}"
REPO_DIR="${SCRIPT_DIR:h:h}"
SOURCE_DIR="$REPO_DIR/opencode/agents"
TARGET_DIR="${OPENCODE_AGENTS_DIR:-$HOME/.config/opencode/agents}"

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

say "T.H.O.T.H. OpenCode agent installer"
say "Agent source: $SOURCE_DIR"
say "Agent target: $TARGET_DIR"

if [[ ! -d "$SOURCE_DIR" ]]; then
  say "Cannot find OpenCode agents at $SOURCE_DIR"
  exit 1
fi

run mkdir -p "$TARGET_DIR"
run cp "$SOURCE_DIR"/*.md "$TARGET_DIR"/

say "OpenCode agent installation finished."
say "Restart OpenCode, then select or mention the thoth-memory agent."
