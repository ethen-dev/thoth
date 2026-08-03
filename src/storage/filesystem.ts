import { mkdir, stat, writeFile } from "node:fs/promises";
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
