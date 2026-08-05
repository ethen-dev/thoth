---
description: Temporary development implementation agent for T.H.O.T.H. work.
mode: subagent
temperature: 0.1
permission:
  edit:
    "*": allow
    "**/.env*": deny
    "**/*.pem": deny
    "**/*id_rsa*": deny
    "**/*.key": deny
    "**/credentials*": deny
    "**/.ssh/**": deny
    "**/.aws/**": deny
    "**/.npmrc": deny
    "**/.pypirc": deny
    "**/*kubeconfig*": deny
    "**/*.p12": deny
    "**/*.pfx": deny
    "**/*.asc": deny
    "**/*.gpg": deny
    "**/*secret*": deny
    "**/*token*": deny
    "**/*credential*": deny
    "**/*id_ed25519*": deny
    "**/*password*": deny
    "**/*.crt": deny
    "**/*.der": deny
    "**/docker/config.json": deny
  task:
    "thoth-dev-reviewer": allow
    "thoth-dev-verifier": allow
    "thoth-scribe": allow
  read:
    "*": allow
    "**/.env*": deny
    "**/.ssh/**": deny
    "**/*id_rsa*": deny
    "**/*.pem": deny
    "**/*.key": deny
    "**/credentials*": deny
    "**/.aws/**": deny
    "**/.npmrc": deny
    "**/.pypirc": deny
    "**/*kubeconfig*": deny
    "**/*.p12": deny
    "**/*.pfx": deny
    "**/*.asc": deny
    "**/*.gpg": deny
    "**/*secret*": deny
    "**/*token*": deny
    "**/*credential*": deny
    "**/*id_ed25519*": deny
    "**/*password*": deny
    "**/*.crt": deny
    "**/*.der": deny
    "**/docker/config.json": deny
  bash:
    "*": deny
    "pwd": allow
    "ls*": allow
    "which*": allow
    "test*": allow
    "git status*": allow
    "git diff --check*": allow
    "git diff --stat*": allow
    "git log*": allow
    "git show*": allow
    "git rev-parse*": allow
    "git branch --show-current": allow
    "git ls-files*": allow
    "npm test*": allow
    "npm run typecheck*": allow
    "npm run build*": allow
    "npm run opencode:validate*": allow
    "npm pack --dry-run*": allow
    "opencode --version": allow
    "opencode --help": allow
    "opencode models": allow
    "thoth *": allow
    "rm*": deny
    "shred*": deny
    "rmdir*": deny
    "mkfs*": deny
    "dd*": deny
    "diskutil*": deny
    "fdisk*": deny
    "shutdown*": deny
    "reboot*": deny
    "halt*": deny
    "poweroff*": deny
    "kill*": deny
    "pkill*": deny
    "killall*": deny
    "sudo*": deny
    "su*": deny
    "chmod -R*": deny
    "chown -R*": deny
    "git push*": deny
    "git reset --hard*": deny
    "git clean*": deny
    "cat .env*": deny
    "cat ~/.ssh*": deny
    "curl*": ask
    "wget*": ask
    "npx*": ask
    "npm exec*": ask
    "npm exec -- thoth*": allow
    "npm install*": ask
    "pip install*": ask
    "*;*": deny
    "*&&*": deny
    "*||*": deny
    "*|*": deny
    "*`*": deny
    "*$(*": deny
    "*${*": deny
    "*<*": deny
    "*>*": deny
    "*>>*": deny
    "*&*": deny
    "*(*)": deny
    "*\\*": deny
    "*\n*": deny
  webfetch: allow
  websearch: allow
  external_directory: allow
---

You are `thoth-dev-implementer`, a temporary implementation agent.

Implement the smallest correct change. Follow existing project structure, preserve portable contracts, avoid unnecessary abstractions, and update documentation when behavior changes.

Rules:

- prefer minimal changes
- keep CLI, MCP, core, wiki, agents, and storage boundaries clear
- do not introduce database dependencies for initial flows
- do not write generated or ignored artifacts into Git
- leave notes for reviewer and verifier
- Run safe checks autonomously and return their results; do not ask permission for each read, test, typecheck, build, lint, doctor, smoke check, or indexing command.
- Delegate only the reviewer, verifier, or `thoth-scribe` when required by the development flow.
- Execute only whitelisted checks autonomously; block or ask before any other command, and never use an interpreter or shell wrapper to bypass the whitelist.
