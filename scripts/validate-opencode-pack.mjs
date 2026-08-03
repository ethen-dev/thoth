import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import process from "node:process";

const root = process.cwd();
const agentPath = join(root, "opencode", "agents", "thoth-memory.md");
const subagentPaths = [
  join(root, "opencode", "agents", "thoth-archivist.md"),
  join(root, "opencode", "agents", "thoth-indexer.md"),
  join(root, "opencode", "agents", "thoth-scribe.md"),
  join(root, "opencode", "agents", "thoth-critic.md"),
];
const autonomousMemoryDocPath = join(root, "docs", "autonomous-memory.md");
const macThothInstallerPath = join(root, "opencode", "install", "install-thoth.command");
const macAgentInstallerPath = join(root, "opencode", "install", "install-opencode-agent.command");
const macUpdaterPath = join(root, "opencode", "install", "update-thoth.command");
const linuxThothInstallerPath = join(root, "opencode", "install", "install-thoth.sh");
const linuxAgentInstallerPath = join(root, "opencode", "install", "install-opencode-agent.sh");
const linuxUpdaterPath = join(root, "opencode", "install", "update-thoth.sh");
const windowsThothInstallerPath = join(root, "opencode", "install", "install-thoth.ps1");
const windowsAgentInstallerPath = join(root, "opencode", "install", "install-opencode-agent.ps1");
const windowsUpdaterPath = join(root, "opencode", "install", "update-thoth.ps1");
const readmePath = join(root, "opencode", "README.md");

const requiredAgentSnippets = [
  "description: Autonomous memory agent",
  "Autonomous Memory Policy",
  "autonomous but transparent",
  "Automatically preserve",
  "Use a confidence threshold",
  "Memoria actualizada",
  "Agentic Project Intake",
  "thoth-archivist",
  "thoth-indexer",
  "thoth-scribe",
  "thoth-critic",
  "study and memorize this project",
  "session log",
  "thoth index",
  "index status",
  "pwd",
  "ls*",
  "rg*",
  "mode: primary",
  "edit: deny",
  "thoth search*",
  "thoth capture*",
  "thoth doctor*",
  "You are T.H.O.T.H.",
];

const requiredReadmeSnippets = [
  "install-thoth.command",
  "install-opencode-agent.command",
  "install-thoth.sh",
  "install-opencode-agent.sh",
  "install-thoth.ps1",
  "install-opencode-agent.ps1",
  "update-thoth.command",
  "update-thoth.sh",
  "update-thoth.ps1",
  "~/Documents/Thoth/workspace",
  "~/Documents/Thoth/wiki",
  "thoth doctor",
  "--dry-run",
  "Autonomous Memory",
  "autonomous but transparent",
  "docs/autonomous-memory.md",
  "Project Study Flow",
  "thoth-archivist",
  "thoth-indexer",
  "thoth-scribe",
  "thoth-critic",
  "session log",
  "thoth index",
];

const requiredSubagentSnippets = [
  "mode: subagent",
  "edit: deny",
  "\"*\": ask",
  "thoth search*",
];

const requiredAutonomousMemoryDocSnippets = [
  "autonomous-transparent",
  "Save Automatically",
  "Ask First",
  "Ignore By Default",
  "Memory Flow",
  "session log",
  "thoth index",
  "Current Implementation Boundary",
];

async function assertFile(path) {
  await access(path, constants.R_OK);
}

async function assertExecutable(path) {
  await access(path, constants.X_OK);
}

function assertIncludes(content, snippets, label) {
  const missing = snippets.filter((snippet) => !content.includes(snippet));
  if (missing.length > 0) {
    throw new Error(`${label} is missing: ${missing.join(", ")}`);
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed\n${result.stdout}${result.stderr}`,
    );
  }

  return `${result.stdout}${result.stderr}`;
}

function findCommand(commands) {
  for (const command of commands) {
    const result = spawnSync(command, ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"], {
      cwd: root,
      encoding: "utf8",
    });

    if (result.status === 0) {
      return command;
    }
  }

  return undefined;
}

await Promise.all([
  assertFile(agentPath),
  ...subagentPaths.map((path) => assertFile(path)),
  assertFile(autonomousMemoryDocPath),
  assertFile(macThothInstallerPath),
  assertFile(macAgentInstallerPath),
  assertFile(macUpdaterPath),
  assertFile(linuxThothInstallerPath),
  assertFile(linuxAgentInstallerPath),
  assertFile(linuxUpdaterPath),
  assertFile(windowsThothInstallerPath),
  assertFile(windowsAgentInstallerPath),
  assertFile(windowsUpdaterPath),
  assertFile(readmePath),
  assertExecutable(macThothInstallerPath),
  assertExecutable(macAgentInstallerPath),
  assertExecutable(macUpdaterPath),
  assertExecutable(linuxThothInstallerPath),
  assertExecutable(linuxAgentInstallerPath),
  assertExecutable(linuxUpdaterPath),
]);

const [agent, readme, autonomousMemoryDoc] = await Promise.all([
  readFile(agentPath, "utf8"),
  readFile(readmePath, "utf8"),
  readFile(autonomousMemoryDocPath, "utf8"),
]);

assertIncludes(agent, requiredAgentSnippets, "OpenCode agent");
assertIncludes(readme, requiredReadmeSnippets, "OpenCode README");
assertIncludes(autonomousMemoryDoc, requiredAutonomousMemoryDocSnippets, "Autonomous memory doc");

const subagents = await Promise.all(subagentPaths.map((path) => readFile(path, "utf8")));
for (const [index, subagent] of subagents.entries()) {
  assertIncludes(subagent, requiredSubagentSnippets, `OpenCode subagent ${subagentPaths[index]}`);
}

run("zsh", ["-n", macThothInstallerPath]);
run("zsh", ["-n", macAgentInstallerPath]);
run("zsh", ["-n", macUpdaterPath]);
run("bash", ["-n", linuxThothInstallerPath]);
run("bash", ["-n", linuxAgentInstallerPath]);
run("bash", ["-n", linuxUpdaterPath]);

const macThothDryRun = run(macThothInstallerPath, ["--dry-run"]);
const macAgentDryRun = run(macAgentInstallerPath, ["--dry-run"]);
const macUpdaterDryRun = run(macUpdaterPath, ["--dry-run", "--skip-pull"]);
const linuxThothDryRun = run(linuxThothInstallerPath, ["--dry-run"]);
const linuxAgentDryRun = run(linuxAgentInstallerPath, ["--dry-run"]);
const linuxUpdaterDryRun = run(linuxUpdaterPath, ["--dry-run", "--skip-pull"]);

assertIncludes(macThothDryRun, ["DRY RUN", "install dependencies", "thoth init", "thoth doctor"], "macOS T.H.O.T.H. installer dry-run");
assertIncludes(macAgentDryRun, ["DRY RUN", "thoth-memory.md", "thoth-archivist.md", "thoth-critic.md"], "macOS OpenCode agent installer dry-run");
assertIncludes(macUpdaterDryRun, ["DRY RUN", "Skipping git pull", "install-thoth.command", "install-opencode-agent.command"], "macOS updater dry-run");
assertIncludes(linuxThothDryRun, ["DRY RUN", "install dependencies", "thoth init", "thoth doctor"], "Linux T.H.O.T.H. installer dry-run");
assertIncludes(linuxAgentDryRun, ["DRY RUN", "thoth-memory.md", "thoth-archivist.md", "thoth-critic.md"], "Linux OpenCode agent installer dry-run");
assertIncludes(linuxUpdaterDryRun, ["DRY RUN", "Skipping git pull", "install-thoth.sh", "install-opencode-agent.sh"], "Linux updater dry-run");

const windowsThothInstaller = await readFile(windowsThothInstallerPath, "utf8");
const windowsAgentInstaller = await readFile(windowsAgentInstallerPath, "utf8");
const windowsUpdater = await readFile(windowsUpdaterPath, "utf8");

assertIncludes(windowsThothInstaller, ["param(", "[switch]$DryRun", "npm", "npm\" @(" , "thoth init", "thoth doctor"], "Windows T.H.O.T.H. installer");
assertIncludes(windowsAgentInstaller, ["param(", "[switch]$DryRun", "*.md", "Copy-Item"], "Windows OpenCode agent installer");
assertIncludes(windowsUpdater, ["param(", "[switch]$DryRun", "[switch]$SkipPull", "git", "install-thoth.ps1", "install-opencode-agent.ps1"], "Windows updater");

const powershell = findCommand(["pwsh", "powershell"]);
if (powershell) {
  run(powershell, ["-NoProfile", "-Command", `[scriptblock]::Create((Get-Content -Raw '${windowsThothInstallerPath.replaceAll("'", "''")}')) | Out-Null`]);
  run(powershell, ["-NoProfile", "-Command", `[scriptblock]::Create((Get-Content -Raw '${windowsAgentInstallerPath.replaceAll("'", "''")}')) | Out-Null`]);
  run(powershell, ["-NoProfile", "-Command", `[scriptblock]::Create((Get-Content -Raw '${windowsUpdaterPath.replaceAll("'", "''")}')) | Out-Null`]);
}

console.log("OpenCode pack validation passed.");
