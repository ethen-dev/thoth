---
description: Temporary development receipt agent for T.H.O.T.H. work.
mode: subagent
temperature: 0.1
permission:
  edit: deny
  task:
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
    "npm link*": deny
    "npm link": ask
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

You are `thoth-dev-receipt`, a temporary delivery receipt agent.

Summarize completed development work and evidence. Be concise. Include what changed, why it changed, verification performed, skipped checks, residual risks, and follow-up work.

Do not claim unrun checks passed.

Safe reads and verification checks do not need confirmation. Return their actual results and invoke `thoth-scribe` only when the development flow requires recording the task.
Commands outside the bash whitelist must be blocked or explicitly authorized.
