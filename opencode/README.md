# T.H.O.T.H. for OpenCode

This folder contains the OpenCode integration for T.H.O.T.H., a local memory system backed by a Markdown wiki.

Use this when you want OpenCode to remember decisions, notes, project context, and links between ideas across sessions.

## Install

Open Terminal in the T.H.O.T.H. repository folder and run:

```sh
opencode/install/install-thoth.command
opencode/install/install-opencode-agent.command
```

The first installer creates:

- `~/Documents/Thoth/workspace`
- `~/Documents/Thoth/wiki`
- `~/Documents/Thoth/workspace/thoth.config.json`

The second installer copies the OpenCode agent to:

- `~/.config/opencode/agents/thoth-memory.md`

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

## Where Your Memory Lives

Your memory is plain Markdown on your computer:

```text
~/Documents/Thoth/wiki
```

You can read these files directly. T.H.O.T.H. treats them as the source of truth.

## Safe Test Run

To preview what the installers would do without changing files, run:

```sh
opencode/install/install-thoth.command --dry-run
opencode/install/install-opencode-agent.command --dry-run
```

## Update Later

After pulling a newer version of the repository, run the installers again:

```sh
opencode/install/install-thoth.command
opencode/install/install-opencode-agent.command
```

This updates the installed command and OpenCode agent. It does not delete your wiki.
