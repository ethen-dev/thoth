# T.H.O.T.H. for OpenCode

This folder contains the OpenCode integration for T.H.O.T.H., a local memory system backed by a Markdown wiki.

Use this when you want OpenCode to answer your requests and also remember decisions, notes, project context, and links between ideas across sessions.

## Install On macOS

Open Terminal in the T.H.O.T.H. repository folder and run:

```sh
opencode/install/install-thoth.command
opencode/install/install-opencode-agent.command
```

## Install On Linux

Open a shell in the T.H.O.T.H. repository folder and run:

```sh
opencode/install/install-thoth.sh
opencode/install/install-opencode-agent.sh
```

## Install On Windows

Open PowerShell in the T.H.O.T.H. repository folder and run:

```powershell
.\opencode\install\install-thoth.ps1
.\opencode\install\install-opencode-agent.ps1
```

If PowerShell blocks local scripts, run the installer with a process-scoped execution policy:

```powershell
powershell -ExecutionPolicy Bypass -File .\opencode\install\install-thoth.ps1
powershell -ExecutionPolicy Bypass -File .\opencode\install\install-opencode-agent.ps1
```

## What The Installers Create

The first installer creates:

- `~/Documents/Thoth/workspace`
- `~/Documents/Thoth/wiki`
- `~/Documents/Thoth/workspace/thoth.config.json`

It also installs dependencies, builds T.H.O.T.H., and installs the `thoth` command globally from the local repository.

On macOS and Linux, if npm cannot write to the system global package folder, the installer uses a user-owned prefix at `~/.npm-global` instead of requiring `sudo`. If a new Terminal cannot find `thoth` afterward, add this to your shell profile:

```sh
export PATH="$HOME/.npm-global/bin:$PATH"
```

The second installer copies the OpenCode agents to:

- `~/.config/opencode/agents/thoth-memory.md`
- `~/.config/opencode/agents/thoth-archivist.md`
- `~/.config/opencode/agents/thoth-indexer.md`
- `~/.config/opencode/agents/thoth-scribe.md`
- `~/.config/opencode/agents/thoth-critic.md`

On Windows, the default memory folder is `Documents\Thoth`, and the agent is copied to `.config\opencode\agents` under your user profile.

After installing, restart OpenCode.

## Check It Works

In OpenCode or Terminal, run:

```sh
cd ~/Documents/Thoth/workspace
thoth doctor
```

You should see the main checks pass. If something fails, ask OpenCode:

```text
Use the thoth-memory agent and diagnose my T.H.O.T.H. setup.
```

## Use It In OpenCode

Select or mention the `thoth-memory` agent, then speak naturally:

You can open OpenCode from any project folder. The installed `thoth` command first looks for a local `thoth.config.json`, then `THOTH_CONFIG`, then the default installed workspace at `~/Documents/Thoth/workspace/thoth.config.json`.

```text
Remember that my garden project uses raised beds and drip irrigation.
```

```text
What did we decide about the garden irrigation?
```

```text
Connect the garden irrigation note with the summer planting plan.
```

```text
Run a health check on my memory wiki.
```

The agent will use the `thoth` command line tool to search, save, update, relate, and diagnose memory. It should ask before storing sensitive information or making ambiguous changes.

## Autonomous Memory

T.H.O.T.H. does not require an explicit "remember this" every time. Its default mode is autonomous but transparent:

- it answers your immediate request
- it notices durable decisions, requirements, preferences, bugs, resolutions, plans, and relations
- it saves clear, non-sensitive memory automatically
- it asks first when information is sensitive, ambiguous, contradictory, or high impact
- it briefly reports memory writes after the main answer

Example:

```text
Let's use Linux and Windows installers too, not only macOS.
```

The agent should answer the request and preserve the durable project decision without needing a separate save command.

## Project Study Flow

For larger projects, ask:

```text
Use the thoth-memory agent. Study and memorize this project.
```

The primary agent should orchestrate the specialist agents:

- `thoth-archivist` reads documentation and extracts durable facts
- `thoth-indexer` maps existing memory, IDs, duplicates, and relations
- `thoth-scribe` writes approved memory with `thoth` commands
- `thoth-critic` reviews privacy, duplication, ambiguity, and structure

Read-only project inspection is allowed to reduce permission prompts. Memory writes still ask for confirmation.

All memory writes should pass through `thoth-scribe` or its writing rules, even for small decisions. The agent should create explicit relations with `thoth relate` when source, target, and relation type are clear. The index is only a generated navigation view; relationships should live in document frontmatter and be mirrored as Markdown links in `## Relations` with `thoth sync-links`. After a project study session that writes memory, the agent should also create or update a session log and run `thoth sync-links` plus `thoth index --human`. Its final response should mention saved documents, explicit relations, link sync status, log status, derived index status, human index status, and unresolved questions.

## Development Agent Flow

T.H.O.T.H. also installs temporary OpenCode development agents:

- `thoth-dev-router`
- `thoth-dev-explorer`
- `thoth-dev-implementer`
- `thoth-dev-reviewer`
- `thoth-dev-verifier`
- `thoth-dev-receipt`

Use them for application development work. The primary `thoth-memory` agent can delegate to them for routing, exploration, implementation, review, verification, and delivery receipts.

The local agent registry can be inspected with:

```sh
thoth agents list
thoth agents validate
```

External user agents can be registered without committing them to T.H.O.T.H.:

```sh
thoth agents register /path/to/my-agent.md
thoth agents list --source external
```

## Where Your Memory Lives

Your memory is plain Markdown on your computer:

```text
~/Documents/Thoth/wiki
```

You can read these files directly. T.H.O.T.H. treats them as the source of truth.

The autonomy policy is documented in `docs/autonomous-memory.md`.

## Safe Test Run

To preview what the installers would do without changing files, run:

```sh
opencode/install/install-thoth.command --dry-run
opencode/install/install-opencode-agent.command --dry-run
```

On Linux:

```sh
opencode/install/install-thoth.sh --dry-run
opencode/install/install-opencode-agent.sh --dry-run
```

On Windows:

```powershell
.\opencode\install\install-thoth.ps1 -DryRun
.\opencode\install\install-opencode-agent.ps1 -DryRun
```

## Update Later

After pulling a newer version of the repository, run the updater.

On macOS:

```sh
opencode/install/update-thoth.command
```

On Linux:

```sh
opencode/install/update-thoth.sh
```

On Windows:

```powershell
.\opencode\install\update-thoth.ps1
```

The updater runs `git pull --ff-only` when the repository is a Git checkout, reinstalls T.H.O.T.H., and copies all OpenCode agents again.

To preview an update without changing files:

```sh
opencode/install/update-thoth.sh --dry-run
```

To update without pulling from Git first:

```sh
opencode/install/update-thoth.sh --skip-pull
```

This updates the installed command and OpenCode agents. It does not delete your wiki.
