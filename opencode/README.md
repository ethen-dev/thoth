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

The second installer copies the OpenCode agent to:

- `~/.config/opencode/agents/thoth-memory.md`

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

After pulling a newer version of the repository, run the installers again:

```sh
opencode/install/install-thoth.command
opencode/install/install-opencode-agent.command
```

This updates the installed command and OpenCode agent. It does not delete your wiki.
