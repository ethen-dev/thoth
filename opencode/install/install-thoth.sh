#!/usr/bin/env bash
set -euo pipefail

DRY_RUN="no"
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN="yes"
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
THOTH_HOME="${THOTH_HOME:-$HOME/Documents/Thoth}"
WORKSPACE_DIR="$THOTH_HOME/workspace"
WIKI_DIR="$THOTH_HOME/wiki"

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

configure_npm_global_install() {
  local npm_root npm_root_parent user_prefix
  npm_root="$(npm root -g 2>/dev/null || true)"

  if [[ -n "$npm_root" ]]; then
    npm_root_parent="$(dirname -- "$npm_root")"
    if [[ -w "$npm_root" || ( ! -e "$npm_root" && -w "$npm_root_parent" ) ]]; then
      return
    fi
  fi

  user_prefix="${NPM_CONFIG_PREFIX:-$HOME/.npm-global}"
  export NPM_CONFIG_PREFIX="$user_prefix"
  export PATH="$user_prefix/bin:$PATH"
  mkdir -p "$user_prefix"
  say "Using user npm global prefix: $user_prefix"
}

say "T.H.O.T.H. Linux installer"
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
  say "DRY RUN: would install dependencies and build T.H.O.T.H. in $REPO_DIR"
  say "DRY RUN: would install T.H.O.T.H. globally from $REPO_DIR"
else
  (cd "$REPO_DIR" && npm install && npm run build)
  configure_npm_global_install
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
if [[ "${NPM_CONFIG_PREFIX:-}" == "$HOME/.npm-global" ]]; then
  say "If a new shell cannot find thoth, add this to your shell profile: export PATH=\"$HOME/.npm-global/bin:\$PATH\""
fi
