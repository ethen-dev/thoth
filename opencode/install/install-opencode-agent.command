#!/bin/zsh
set -euo pipefail

DRY_RUN="no"
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN="yes"
fi

SCRIPT_DIR="${0:A:h}"
REPO_DIR="${SCRIPT_DIR:h:h}"
SOURCE_AGENT="$REPO_DIR/opencode/agents/thoth-memory.md"
TARGET_DIR="${OPENCODE_AGENTS_DIR:-$HOME/.config/opencode/agents}"
TARGET_AGENT="$TARGET_DIR/thoth-memory.md"

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
say "Agent source: $SOURCE_AGENT"
say "Agent target: $TARGET_AGENT"

if [[ ! -f "$SOURCE_AGENT" ]]; then
  say "Cannot find thoth-memory agent at $SOURCE_AGENT"
  exit 1
fi

run mkdir -p "$TARGET_DIR"
run cp "$SOURCE_AGENT" "$TARGET_AGENT"

say "OpenCode agent installation finished."
say "Restart OpenCode, then select or mention the thoth-memory agent."
