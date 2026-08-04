import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

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
): Promise<"created" | "exists"> {
  if (await pathExists(filePath)) {
    return "exists";
  }

  await ensureDirectory(path.dirname(filePath));
  await writeFile(filePath, content, "utf8");
  return "created";
}

export async function appendTextToFile(
  filePath: string,
  text: string,
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

  await writeFile(filePath, `${base}${separator}${entry}\n`, "utf8");
}
