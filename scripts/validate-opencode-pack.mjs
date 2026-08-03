import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import process from "node:process";

const root = process.cwd();
const agentPath = join(root, "opencode", "agents", "thoth-memory.md");
const thothInstallerPath = join(root, "opencode", "install", "install-thoth.command");
const agentInstallerPath = join(root, "opencode", "install", "install-opencode-agent.command");
const readmePath = join(root, "opencode", "README.md");

const requiredAgentSnippets = [
  "description: Persistent memory agent",
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
  "~/Documents/Thoth/workspace",
  "~/Documents/Thoth/wiki",
  "thoth doctor",
  "--dry-run",
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

await Promise.all([
  assertFile(agentPath),
  assertFile(thothInstallerPath),
  assertFile(agentInstallerPath),
  assertFile(readmePath),
  assertExecutable(thothInstallerPath),
  assertExecutable(agentInstallerPath),
]);

const [agent, readme] = await Promise.all([
  readFile(agentPath, "utf8"),
  readFile(readmePath, "utf8"),
]);

assertIncludes(agent, requiredAgentSnippets, "OpenCode agent");
assertIncludes(readme, requiredReadmeSnippets, "OpenCode README");

run("zsh", ["-n", thothInstallerPath]);
run("zsh", ["-n", agentInstallerPath]);

const thothDryRun = run(thothInstallerPath, ["--dry-run"]);
const agentDryRun = run(agentInstallerPath, ["--dry-run"]);

assertIncludes(thothDryRun, ["DRY RUN", "thoth init", "thoth doctor"], "T.H.O.T.H. installer dry-run");
assertIncludes(agentDryRun, ["DRY RUN", "thoth-memory.md"], "OpenCode agent installer dry-run");

console.log("OpenCode pack validation passed.");
