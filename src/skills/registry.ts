import { lstat, readFile, readdir, realpath, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import matter from "gray-matter";
import { z } from "zod/v4";
import type { Skill, SkillLimits, SkillManifest, SkillRuntimeConfig } from "./types.js";

const manifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1).max(120),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/),
  category: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  status: z.enum(["draft", "active", "experimental", "deprecated"]),
  primary_agent: z.string().min(1).max(120).optional(),
}).strict();

export const defaultSkillLimits = {
  maxDepth: 4, maxFiles: 100, maxFileBytes: 256 * 1024,
  maxFrontmatterBytes: 32 * 1024, maxBodyBytes: 224 * 1024, maxTotalBytes: 4 * 1024 * 1024,
} as const;

export async function discoverSkills(config: SkillRuntimeConfig, limits: Partial<SkillLimits> = {}): Promise<Skill[]> {
  const safeLimits = { ...defaultSkillLimits, ...limits };
  const roots = await skillRoots(config);
  const files: string[] = [];
  for (const root of roots) await collectMarkdown(root, root, files, safeLimits, 0);
  if (files.length > safeLimits.maxFiles) throw new Error(`Skill limit exceeded: maxFiles=${safeLimits.maxFiles}`);
  const skills: Skill[] = [];
  const ids = new Map<string, string>();
  let totalBytes = 0;
  for (const file of files.sort()) {
    const bytes = (await stat(file)).size;
    if (bytes > safeLimits.maxFileBytes) throw new Error(`Skill limit exceeded: file too large (${path.basename(file)})`);
    totalBytes += bytes;
    if (totalBytes > safeLimits.maxTotalBytes) throw new Error(`Skill limit exceeded: maxTotalBytes=${safeLimits.maxTotalBytes}`);
    const source = await readFile(file, "utf8");
    const frontmatterBytes = Buffer.byteLength(source.match(/^---[\s\S]*?---/)?.[0] ?? "", "utf8");
    if (frontmatterBytes > safeLimits.maxFrontmatterBytes) throw new Error(`Skill limit exceeded: frontmatter too large (${path.basename(file)})`);
    const parsed = matter(source);
    if (Buffer.byteLength(parsed.content) > safeLimits.maxBodyBytes) throw new Error(`Skill limit exceeded: body too large (${path.basename(file)})`);
    // Pack READMEs are documentation, not skill manifests.
    if (Object.keys(parsed.data).length === 0) continue;
    const result = manifestSchema.safeParse(parsed.data);
    if (!result.success) throw new Error(`Invalid skill metadata in ${file}: ${result.error.issues.map((i) => i.path.join(".") + " " + i.message).join(", ")}`);
    const manifest: SkillManifest = { id: result.data.id, name: result.data.name, version: result.data.version, category: result.data.category, status: result.data.status, path: publicPath(config, file) };
    const previous = ids.get(manifest.id);
    if (previous) throw new Error(`Duplicate skill id: ${manifest.id} (${previous}, ${file})`);
    ids.set(manifest.id, file);
    skills.push({ ...manifest, body: parsed.content });
  }
  return skills;
}

export async function getSkill(config: SkillRuntimeConfig, id: string): Promise<Skill | undefined> {
  return (await discoverSkills(config)).find((skill) => skill.id === id);
}

export async function validateSkills(config: SkillRuntimeConfig) {
  try {
    const skills = await discoverSkills(config);
    return { ok: true, skillsChecked: skills.length, issues: [] as string[] };
  } catch (error) {
    return { ok: false, skillsChecked: 0, issues: [error instanceof Error ? error.message : String(error)] };
  }
}

async function skillRoots(config: SkillRuntimeConfig): Promise<string[]> {
  const integrated = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../skills/llm-wiki");
  const candidates = [path.join(config.workspacePath, ".thoth", "skills"), path.join(config.resolvedWikiPath, ".thoth", "skills"), integrated];
  const roots: string[] = [];
  for (const candidate of candidates) {
    try {
      const stat = await lstat(candidate);
      if (stat.isSymbolicLink()) throw new Error(`Unsafe skill path (symlink): ${candidate}`);
      await assertNoSymlinkComponents(candidate, candidate === integrated ? path.dirname(path.dirname(candidate)) : path.dirname(path.dirname(candidate)));
      const root = await realpath(candidate);
      if (candidate !== integrated && !isWithin(await realpath(path.resolve(path.dirname(candidate), "..")), root)) throw new Error(`Unsafe skill path: ${candidate}`);
      roots.push(root);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Unsafe skill path")) throw error;
      /* optional root */
    }
  }
  return [...new Set(roots)];
}

async function assertNoSymlinkComponents(candidate: string, base: string): Promise<void> {
  const relative = path.relative(base, candidate);
  let current = base;
  for (const component of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    if ((await lstat(current)).isSymbolicLink()) throw new Error(`Unsafe skill path (symlink): ${current}`);
  }
}

async function collectMarkdown(root: string, directory: string, output: string[], limits: SkillLimits, depth: number): Promise<void> {
  if (depth > limits.maxDepth) throw new Error(`Skill limit exceeded: maxDepth=${limits.maxDepth}`);
  if ((await realpath(directory)) !== directory) throw new Error(`Unsafe skill path: ${directory}`);
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    const resolved = path.resolve(file);
    if (!isWithin(root, resolved)) throw new Error(`Unsafe skill path: ${file}`);
    if (entry.isSymbolicLink()) throw new Error(`Unsafe skill path (symlink): ${file}`);
    if (entry.isDirectory()) await collectMarkdown(root, file, output, limits, depth + 1);
    else if (entry.isFile() && entry.name.endsWith(".md")) {
      if ((await realpath(file)) !== resolved) throw new Error(`Unsafe skill path: ${file}`);
      if (output.length >= limits.maxFiles) throw new Error(`Skill limit exceeded: maxFiles=${limits.maxFiles}`);
      output.push(resolved);
    }
  }
}

function publicPath(config: SkillRuntimeConfig, file: string): string {
  const integrated = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../skills/llm-wiki");
  if (isWithin(integrated, file)) return path.posix.join("skills/llm-wiki", path.relative(integrated, file).split(path.sep).join("/"));
  const workspaceSkills = path.resolve(config.workspacePath, ".thoth", "skills");
  const wikiSkills = path.resolve(config.resolvedWikiPath, ".thoth", "skills");
  if (isWithin(workspaceSkills, file)) return path.posix.join(".thoth/skills", path.relative(workspaceSkills, file).split(path.sep).join("/"));
  if (isWithin(wikiSkills, file)) return path.posix.join("wiki/.thoth/skills", path.relative(wikiSkills, file).split(path.sep).join("/"));
  return "skills/unknown";
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
