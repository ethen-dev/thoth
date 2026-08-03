#!/bin/zsh
set -euo pipefail

DRY_RUN="no"
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN="yes"
fi

SCRIPT_DIR="${0:A:h}"
REPO_DIR="${SCRIPT_DIR:h:h}"
THOTH_HOME="${THOTH_HOME:-$HOME/Documents/Thoth}"
WORKSPACE_DIR="$THOTH_HOME/workspace"
WIKI_DIR="$THOTH_HOME/wiki"

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

say "T.H.O.T.H. macOS installer"
say "Workspace: $WORKSPACE_DIR"
say "Wiki: $WIKI_DIR"

if ! command -v node >/dev/null 2>&1; then
  say "Node.js is required. Install it from https://nodejs.org/ and run this installer again."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  say "npm is required. It is normally included with Node.js."
  exit 1
fi

run mkdir -p "$WORKSPACE_DIR" "$WIKI_DIR"

if [[ "$DRY_RUN" == "yes" ]]; then
  say "DRY RUN: would install T.H.O.T.H. globally from $REPO_DIR"
else
  npm install -g "$REPO_DIR"
fi

if [[ "$DRY_RUN" == "yes" ]]; then
  say "DRY RUN: would write $WORKSPACE_DIR/thoth.config.json"
else
  cat > "$WORKSPACE_DIR/thoth.config.json" <<EOF
{
  "wikiPath": "../wiki"
}
EOF
fi

if [[ "$DRY_RUN" == "yes" ]]; then
  say "DRY RUN: would run thoth init and thoth doctor"
else
  (cd "$WORKSPACE_DIR" && thoth init && thoth doctor)
fi

say "T.H.O.T.H. installation finished."
say "OpenCode can use this workspace: $WORKSPACE_DIR"
