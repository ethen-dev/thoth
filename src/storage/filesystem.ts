import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { copyFile, lstat, mkdir, open, readFile, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";

const lockContexts = new AsyncLocalStorage<symbol>();
const locks = new Map<string, { owner: symbol; token: string; depth: number; tail: Promise<void> }>();

function assertWorkspacePath(filePath: string, workspaceRoot?: string): string {
  const resolved = path.resolve(filePath);
  if (workspaceRoot) {
    const root = path.resolve(workspaceRoot);
    const relative = path.relative(root, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`Refusing storage path outside workspace: ${filePath}`);
    }
  }
  const basename = path.basename(resolved).toLowerCase();
  if (basename === ".env" || basename === ".npmrc" || /(secret|credential|token|private.?key)/i.test(basename)) {
    throw new Error(`Refusing to overwrite secret-like storage path: ${filePath}`);
  }
  return resolved;
}

async function assertNoSymlinkInPath(filePath: string, workspaceRoot?: string): Promise<void> {
  const resolved = assertWorkspacePath(filePath, workspaceRoot);
  const root = path.resolve(workspaceRoot ?? path.parse(resolved).root);
  let current = root;
  const parts = path.relative(root, path.dirname(resolved)).split(path.sep).filter(Boolean);
  for (const part of parts) {
    current = path.join(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error(`Refusing symlinked storage directory: ${current}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  try {
    if ((await lstat(resolved)).isSymbolicLink()) throw new Error(`Refusing symlinked storage file: ${resolved}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function atomicWriteFile(
  filePath: string,
  content: string,
  options: { workspaceRoot?: string; encoding?: BufferEncoding; mode?: number } = {},
): Promise<void> {
  const resolved = assertWorkspacePath(filePath, options.workspaceRoot);
  await assertNoSymlinkInPath(resolved, options.workspaceRoot);
  await ensureDirectory(path.dirname(resolved));
  const existingMode = await fileMode(resolved);
  const mode = existingMode ?? options.mode ?? 0o644;
  const temporaryPath = path.join(path.dirname(resolved), `.${path.basename(resolved)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporaryPath, "wx", mode);
    await handle.writeFile(content, options.encoding ?? "utf8");
    await handle.chmod(mode);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, resolved);
    try { const directory = await open(path.dirname(resolved), "r"); await directory.sync(); await directory.close(); } catch { /* directory fsync is not portable */ }
  } catch (error) {
    if (handle) await handle.close().catch(() => undefined);
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

export type AtomicWriteBatchEntry = { filePath: string; content: string };
export type AtomicWriteBatchOptions = {
  workspaceRoot?: string;
  encoding?: BufferEncoding;
  mode?: number;
  /** Test/fault-injection hook; production callers should omit it. */
  beforeCommit?: (index: number) => Promise<void>;
};

export async function atomicWriteBatch(
  entries: AtomicWriteBatchEntry[],
  options: AtomicWriteBatchOptions = {},
): Promise<void> {
  const prepared: Array<{ target: string; temp: string; backup?: string; existed: boolean }> = [];
  const committed: typeof prepared = [];
  try {
    for (const entry of entries) {
      const target = assertWorkspacePath(entry.filePath, options.workspaceRoot);
      await assertNoSymlinkInPath(target, options.workspaceRoot);
      await ensureDirectory(path.dirname(target));
      const mode = await fileMode(target) ?? options.mode ?? 0o644;
      const temp = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.batch.tmp`);
      const existed = await pathExists(target);
      let backup: string | undefined;
      const item = { target, temp, backup, existed };
      prepared.push(item);
      if (existed) {
        backup = `${temp}.bak`;
        await copyFile(target, backup);
        const backupHandle = await open(backup, "r+");
        await backupHandle.chmod(mode);
        await backupHandle.close();
        item.backup = backup;
      }
      const handle = await open(temp, "wx", mode);
      await handle.writeFile(entry.content, options.encoding ?? "utf8");
      await handle.chmod(mode);
      await handle.sync();
      await handle.close();
    }
    for (let index = 0; index < prepared.length; index += 1) {
      await options.beforeCommit?.(index);
      await rename(prepared[index].temp, prepared[index].target);
      committed.push(prepared[index]);
    }
  } catch (error) {
    for (const item of committed.reverse()) {
      if (item.existed && item.backup) await rename(item.backup, item.target).catch(() => undefined);
      else await unlink(item.target).catch(() => undefined);
    }
    throw error;
  } finally {
    for (const item of prepared) {
      await unlink(item.temp).catch(() => undefined);
      await unlink(item.backup ?? "").catch(() => undefined);
    }
  }
}

async function fileMode(filePath: string): Promise<number | undefined> {
  try { return (await stat(filePath)).mode & 0o7777; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}

async function assertSafeLockRoot(root: string): Promise<void> {
  const resolved = path.resolve(root);
  try {
    if ((await lstat(resolved)).isSymbolicLink()) throw new Error(`Refusing symlinked lock root: ${resolved}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

type WorkspaceLockOptions = { timeoutMs?: number; staleMs?: number };
type LockMetadata = { pid: number; token: string; timestamp: number };

async function processIsAlive(pid: number): Promise<boolean> {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM"; }
}

async function readLockMetadata(lockPath: string): Promise<LockMetadata | undefined> {
  try {
    const parsed = JSON.parse(await readFile(lockPath, "utf8")) as Partial<LockMetadata>;
    if (typeof parsed.pid !== "number" || typeof parsed.token !== "string" || typeof parsed.timestamp !== "number") return undefined;
    return parsed as LockMetadata;
  } catch { return undefined; }
}

export async function withWorkspaceLock<T>(workspacePath: string, fn: () => Promise<T>, options: WorkspaceLockOptions | number = {}): Promise<T> {
  const key = path.resolve(workspacePath);
  const timeoutMs = typeof options === "number" ? options : options.timeoutMs ?? 5000;
  const staleMs = typeof options === "number" ? 30_000 : options.staleMs ?? 60_000;
  await assertSafeLockRoot(key);
  const context = lockContexts.getStore();
  const current = locks.get(key);
  if (current && current.owner === context) {
    current.depth += 1;
    try { return await fn(); } finally { current.depth -= 1; }
  }
  const owner = context ?? Symbol(key);
  const previous = current?.tail ?? Promise.resolve();
  let releaseQueue!: () => void;
  const queued = new Promise<void>((resolve) => { releaseQueue = resolve; });
  const state = { owner, token: randomUUID(), depth: 1, tail: previous.then(() => queued) };
  locks.set(key, state);
  const deadline = Date.now() + timeoutMs;
  let acquired = false;
  try {
    await Promise.race([previous, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Workspace lock timeout: ${key}`)), Math.max(0, deadline - Date.now()))) ]);
    const lockPath = path.join(key, ".thoth", ".workspace.lock");
    await assertSafeLockRoot(path.dirname(lockPath));
    await ensureDirectory(path.dirname(lockPath));
    await assertSafeLockRoot(path.dirname(lockPath));
    while (true) {
      let lockHandle: Awaited<ReturnType<typeof open>> | undefined;
      try {
        lockHandle = await open(lockPath, "wx", 0o600);
        const metadata: LockMetadata = { pid: process.pid, token: state.token, timestamp: Date.now() };
        await lockHandle.writeFile(`${JSON.stringify(metadata)}\n`, "utf8");
        await lockHandle.sync();
        await lockHandle.chmod(0o600);
        await lockHandle.close();
        lockHandle = undefined;
        try { const directory = await open(path.dirname(lockPath), "r"); await directory.sync(); await directory.close(); } catch { /* directory fsync is not portable */ }
        acquired = true;
        break;
      }
      catch (error) {
        if (lockHandle) await lockHandle.close().catch(() => undefined);
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const existing = await readLockMetadata(lockPath);
        if (existing && Date.now() - existing.timestamp > staleMs && !(await processIsAlive(existing.pid))) {
          const confirmed = await readLockMetadata(lockPath);
          if (confirmed?.token === existing.token) await unlink(lockPath).catch(() => undefined);
        }
        if (Date.now() >= deadline) throw new Error(`Workspace lock timeout: ${key}`);
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    return await lockContexts.run(owner, fn);
  } finally {
    if (acquired) {
      const lockPath = path.join(key, ".thoth", ".workspace.lock");
      const metadata = await readLockMetadata(lockPath);
      if (metadata?.token === state.token) await unlink(lockPath).catch(() => undefined);
    }
    releaseQueue();
    if (locks.get(key) === state) locks.delete(key);
  }
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

export async function ensureDirectory(directoryPath: string): Promise<void> {
  await mkdir(directoryPath, { recursive: true });
}

export async function writeFileIfMissing(
  filePath: string,
  content: string,
  options: { workspaceRoot?: string } = {},
): Promise<"created" | "exists"> {
  if (await pathExists(filePath)) {
    return "exists";
  }

  await ensureDirectory(path.dirname(filePath));
  await atomicWriteFile(filePath, content, options);
  return "created";
}

export async function appendTextToFile(
  filePath: string,
  text: string,
  options: { workspaceRoot?: string } = {},
): Promise<void> {
  const entry = text.trim();

  if (!entry) {
    return;
  }

  await ensureDirectory(path.dirname(filePath));

  const existing = (await pathExists(filePath))
    ? await readFile(filePath, "utf8")
    : "";
  const base = existing.trimEnd();
  const separator = base.length > 0 ? "\n\n" : "";

  await atomicWriteFile(filePath, `${base}${separator}${entry}\n`, options);
}
