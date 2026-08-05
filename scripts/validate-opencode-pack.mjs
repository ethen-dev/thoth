import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import process from "node:process";
import matter from "gray-matter";

const root = process.cwd();
const agentPath = join(root, "opencode", "agents", "thoth-memory.md");
const subagentPaths = [
  join(root, "opencode", "agents", "thoth-archivist.md"),
  join(root, "opencode", "agents", "thoth-indexer.md"),
  join(root, "opencode", "agents", "thoth-scribe.md"),
  join(root, "opencode", "agents", "thoth-critic.md"),
  join(root, "opencode", "agents", "thoth-dev-router.md"),
  join(root, "opencode", "agents", "thoth-dev-explorer.md"),
  join(root, "opencode", "agents", "thoth-dev-implementer.md"),
  join(root, "opencode", "agents", "thoth-dev-reviewer.md"),
  join(root, "opencode", "agents", "thoth-dev-verifier.md"),
  join(root, "opencode", "agents", "thoth-dev-receipt.md"),
];
const agentRegistryPath = join(root, "agents", "registry.json");
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
  "thoth-dev-router",
  "thoth-dev-explorer",
  "thoth-dev-implementer",
  "thoth-dev-reviewer",
  "thoth-dev-verifier",
  "thoth-dev-receipt",
  "thoth agents list",
  "study and memorize this project",
  "session log",
  "thoth index --human",
  "index status",
  "Delegate every memory write to `thoth-scribe`",
  "explicit relations",
  "thoth relate",
  "thoth sync-links",
  "generated views",
  "Markdown links",
  "mode: primary",
  "edit: deny",
  "task:\n    \"thoth-archivist\": allow",
  "bash:\n    \"*\": deny",
  "\"**/.env*\": deny",
  "\"git add*\": allow",
  "\"git commit*\": allow",
  "\"git push*\": allow",
  "\"git push --force*\": deny",
  "\"git push -f*\": deny",
  "\"git reset*\": deny",
  "\"sudo*\": deny",
  "webfetch: allow",
  "external_directory: allow",
  "npm test*",
  "npm run typecheck*",
  "npm run opencode:validate*",
  "npm exec*",
  "npm exec -- thoth*",
  "git diff --check*",
  "git diff --stat*",
  "npm pack --dry-run*",
  "opencode --version",
  "thoth *",
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
  "Development Agent Flow",
  "thoth agents register",
  "session log",
  "thoth index --human",
  "thoth sync-links",
  "explicit relations",
  "generated navigation view",
  "Markdown links",
];

const requiredSubagentSnippets = [
  "mode: subagent",
  "bash:\n    \"*\": deny",
  "\"**/.env*\": deny",
  "\"git push*\": deny",
  "\"sudo*\": deny",
];

const requiredDevelopmentSubagentSnippets = [
  "task:",
  "\"thoth-scribe\": allow",
  "npm test*",
  "npm run typecheck*",
  "npm run opencode:validate*",
  "npm exec -- thoth*",
  "npm pack --dry-run*",
  "opencode --version",
  "thoth *",
];

const safeBashAllows = new Set([
  "pwd",
  "ls*",
  "which*",
  "test*",
  "git add*",
  "git commit*",
  "git push*",
  "git status*",
  "git diff --check*",
  "git diff --stat*",
  "git log*",
  "git show*",
  "git rev-parse*",
  "git branch --show-current",
  "git ls-files*",
  "npm test*",
  "npm run typecheck*",
  "npm run build*",
  "npm run opencode:validate*",
  "npm exec -- thoth*",
  "npm pack --dry-run*",
  "opencode --version",
  "opencode --help",
  "opencode models",
  "thoth *",
]);

const forbiddenBashAllows = [
  "node*",
  "python*",
  "sh*",
  "bash*",
  "zsh*",
  "npm run*",
  "npm exec*",
  "npm pack*",
  "npm run package:smoke*",
  "npm run dev -- *",
  "npx*",
  "curl*",
  "wget*",
  "git diff*",
  "git diff --no-index*",
  "git reset --hard*",
  "git clean*",
  "sudo*",
];

const requiredBashDenies = [
  "git reset --hard*",
  "git clean*",
  "sudo*",
  "rm*",
  "shred*",
  "mkfs*",
  "dd*",
  "cat .env*",
  "cat ~/.ssh*",
];

const requiredWrapperDenies = [
  "*;*",
  "*&&*",
  "*||*",
  "*|*",
  "*`*",
  "*$(*",
  "*${*",
  "*<*",
  "*>*",
  "*>>*",
  "*&*",
  "*(*)",
  "*\\*",
  "*\n*",
];

const approvedTaskAgents = [
  "thoth-archivist",
  "thoth-indexer",
  "thoth-scribe",
  "thoth-critic",
  "thoth-dev-router",
  "thoth-dev-explorer",
  "thoth-dev-implementer",
  "thoth-dev-reviewer",
  "thoth-dev-verifier",
  "thoth-dev-receipt",
];

const requiredReadSecretPatterns = [
  "**/.env*",
  "**/.ssh/**",
  "**/.aws/**",
  "**/.npmrc",
  "**/.pypirc",
  "**/*.pem",
  "**/*.key",
  "**/*.p12",
  "**/*.pfx",
  "**/*id_rsa*",
  "**/*id_ed25519*",
  "**/credentials*",
  "**/*kubeconfig*",
  "**/*.asc",
  "**/*.gpg",
  "**/*secret*",
  "**/*token*",
  "**/*credential*",
  "**/*password*",
  "**/*.crt",
  "**/*.der",
  "**/docker/config.json",
];

const expectedTaskPermissions = {
  "thoth-memory.md": Object.fromEntries(approvedTaskAgents.map((agent) => [agent, "allow"])),
  "thoth-dev-router.md": {
    "thoth-dev-explorer": "allow",
    "thoth-dev-implementer": "allow",
    "thoth-scribe": "allow",
  },
  "thoth-dev-implementer.md": {
    "thoth-dev-reviewer": "allow",
    "thoth-dev-verifier": "allow",
    "thoth-scribe": "allow",
  },
  "thoth-dev-reviewer.md": {
    "thoth-dev-verifier": "allow",
    "thoth-scribe": "allow",
  },
  "thoth-dev-explorer.md": { "thoth-scribe": "allow" },
  "thoth-dev-verifier.md": { "thoth-scribe": "allow" },
  "thoth-dev-receipt.md": { "thoth-scribe": "allow" },
};

function assertPermissionContract(path, content) {
  const data = matter(content).data;
  const permissions = data.permission;
  const bash = permissions?.bash;
  if (!bash || bash["*"] !== "deny") {
    throw new Error(`${path} must set bash "*" to deny`);
  }

  for (const command of Object.keys(bash)) {
    if (bash[command] === "allow" && !safeBashAllows.has(command)) {
      throw new Error(`${path} has an unsafe bash allow: ${command}`);
    }
  }
  for (const command of forbiddenBashAllows) {
    if (bash[command] === "allow") {
      throw new Error(`${path} must not allow: ${command}`);
    }
  }
  for (const command of requiredBashDenies) {
    if (bash[command] !== "deny") {
      throw new Error(`${path} must deny: ${command}`);
    }
  }
  if (bash["npm exec*"] !== "ask" || bash["npm exec -- thoth*"] !== "allow") {
    throw new Error(`${path} must ask for generic npm exec and allow only npm exec -- thoth*`);
  }
  const execOrder = Object.keys(bash);
  if (execOrder.indexOf("npm exec -- thoth*") <= execOrder.indexOf("npm exec*")) {
    throw new Error(`${path} must place npm exec -- thoth* after generic npm exec`);
  }
  if (path.endsWith("thoth-memory.md")) {
    for (const command of ["git add*", "git commit*", "git push*"]) {
      if (bash[command] !== "allow") {
        throw new Error(`${path} must allow authorized Git operation: ${command}`);
      }
    }
    for (const command of ["git push --force*", "git push -f*", "git reset*", "git clean*"]) {
      if (bash[command] !== "deny") {
        throw new Error(`${path} must deny destructive Git operation: ${command}`);
      }
    }
    const order = Object.keys(bash);
    const lastSafeGitAllow = Math.max(...["git add*", "git commit*", "git push*"].map((command) => order.indexOf(command)));
    for (const command of ["git push --force*", "git push -f*", "git reset*", "git clean*"]) {
      if (order.indexOf(command) <= lastSafeGitAllow) {
        throw new Error(`${path} must place destructive Git denial after authorized Git allows: ${command}`);
      }
    }
  }
  const lastAllow = Math.max(
    ...Object.entries(bash)
      .filter(([, value]) => value === "allow")
      .map(([command]) => Object.keys(bash).indexOf(command)),
  );
  for (const command of requiredWrapperDenies) {
    if (bash[command] !== "deny") {
      throw new Error(`${path} must deny shell metacharacter pattern ${command}`);
    }
    if (Object.keys(bash).indexOf(command) <= lastAllow) {
      throw new Error(`${path} must place shell metacharacter denials after allows`);
    }
  }

  for (const pattern of requiredReadSecretPatterns) {
    if (permissions.read?.[pattern] !== "deny") {
      throw new Error(`${path} must deny read for ${pattern}`);
    }
  }

  const task = permissions?.task;
  const taskFile = Object.keys(expectedTaskPermissions).find((name) => path.endsWith(name));
  if (taskFile && JSON.stringify(task) !== JSON.stringify(expectedTaskPermissions[taskFile])) {
    throw new Error(`${path} has task permissions outside the approved flow`);
  }
  if (!taskFile && task !== undefined) {
    throw new Error(`${path} must not define task permissions`);
  }

  if (path.endsWith("thoth-dev-implementer.md")) {
    if (permissions.edit?.["*"] !== "allow") {
      throw new Error(`${path} must allow edit for implementation work`);
    }
    for (const pattern of requiredReadSecretPatterns) {
      if (permissions.edit?.[pattern] !== "deny") {
        throw new Error(`${path} must deny edit and read for ${pattern}`);
      }
    }
  } else if (permissions.edit !== "deny") {
    throw new Error(`${path} must keep edit denied`);
  }
}

const requiredAutonomousMemoryDocSnippets = [
  "autonomous-transparent",
  "Save Automatically",
  "Ask First",
  "Ignore By Default",
  "Memory Flow",
  "session log",
  "thoth index --human",
  "small decisions",
  "relation map",
  "not the source of the graph",
  "Markdown links",
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
  assertFile(agentRegistryPath),
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
assertPermissionContract(agentPath, agent);
assertIncludes(readme, requiredReadmeSnippets, "OpenCode README");
assertIncludes(autonomousMemoryDoc, requiredAutonomousMemoryDocSnippets, "Autonomous memory doc");

const subagents = await Promise.all(subagentPaths.map((path) => readFile(path, "utf8")));
for (const [index, subagent] of subagents.entries()) {
  assertIncludes(subagent, requiredSubagentSnippets, `OpenCode subagent ${subagentPaths[index]}`);
  assertPermissionContract(subagentPaths[index], subagent);
  if (subagentPaths[index].includes("thoth-dev-")) {
    assertIncludes(subagent, requiredDevelopmentSubagentSnippets, `OpenCode development subagent ${subagentPaths[index]}`);
  }
}

const agentRegistry = await readFile(agentRegistryPath, "utf8");
assertIncludes(agentRegistry, ["thoth-memory", "thoth-dev-router", "thoth-dev-verifier", "temporary"], "Agent registry");

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
assertIncludes(macAgentDryRun, ["DRY RUN", "thoth-memory.md", "thoth-archivist.md", "thoth-critic.md", "thoth-dev-router.md"], "macOS OpenCode agent installer dry-run");
assertIncludes(macUpdaterDryRun, ["DRY RUN", "Skipping git pull", "install-thoth.command", "install-opencode-agent.command"], "macOS updater dry-run");
assertIncludes(linuxThothDryRun, ["DRY RUN", "install dependencies", "thoth init", "thoth doctor"], "Linux T.H.O.T.H. installer dry-run");
assertIncludes(linuxAgentDryRun, ["DRY RUN", "thoth-memory.md", "thoth-archivist.md", "thoth-critic.md", "thoth-dev-router.md"], "Linux OpenCode agent installer dry-run");
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
