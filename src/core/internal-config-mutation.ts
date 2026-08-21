import { createHash } from "node:crypto";
import { atomicWriteFile, withWorkspaceLock } from "../storage/filesystem.js";
import { z } from "zod/v4";
import { configConfirmationToken, configMutationKeys, readConfigSnapshot, type ConfigMutation, type ResolvedThothConfig, supportedDateFormats } from "./config.js";
import type { ThothPlan } from "./types.js";

const configMutationSchema = z.object({ defaultType: z.string().min(1).max(100).optional(), defaultStatus: z.string().min(1).max(100).optional(), dateFormat: z.enum(supportedDateFormats).optional() }).strict();

/** Internal-only plan builder for wiki-config; this module is not part of the Core API. */
export function planConfigMutation(changes: Record<string, unknown>, expectedHash: string): ThothPlan {
  const checked = z.object({ expectedHash: z.string().regex(/^[a-f0-9]{64}$/), changes: configMutationSchema }).strict().safeParse({ changes, expectedHash });
  if (!checked.success) return { version: 1, intent: "wiki-config", steps: [], confirmationRequired: false, status: "error", error: { code: "invalid_input", message: "Invalid wiki-config mutation", details: checked.error.issues } };
  return { version: 1, intent: "wiki-config", steps: [{ id: "config-step-1", action: "config.update", input: checked.data, write: true, summary: "Update allowlisted wiki configuration" }], confirmationRequired: true, status: "planned" };
}

/** Internal-only mutation primitive. It is intentionally not exported by the Core API. */
export async function applyConfigMutation(config: ResolvedThothConfig, changes: unknown, expectedHash: unknown, authorization: { token: string; tokenInput: unknown }): Promise<{ updated: true; changed: ConfigMutation; hash: string }> {
  const checkedChanges = configMutationSchema.safeParse(changes);
  if (!checkedChanges.success) throw new Error(`Invalid wiki-config changes: ${checkedChanges.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`).join(", ")}`);
  if (typeof expectedHash !== "string" || !/^[a-f0-9]{64}$/.test(expectedHash)) throw new Error("Invalid configuration hash");
  return withWorkspaceLock(config.workspacePath, async () => {
    const snapshot = await readConfigSnapshot(config);
    if (snapshot.hash !== expectedHash) throw new Error("configuration_changed");
    if (configConfirmationToken(authorization.tokenInput) !== authorization.token) throw new Error("confirmation_mismatch");
    const changed: ConfigMutation = {};
    for (const key of configMutationKeys) if (checkedChanges.data[key] !== undefined) {
      if (snapshot.effective[key] === checkedChanges.data[key]) throw new Error("change_has_no_effect");
      changed[key] = checkedChanges.data[key];
    }
    if (Object.keys(changed).length === 0) throw new Error("change_has_no_effect");
    const content = `${JSON.stringify({ ...snapshot.raw, ...changed }, null, 2)}\n`;
    await atomicWriteFile(config.configPath, content, { workspaceRoot: config.workspacePath });
    return { updated: true, changed, hash: createHash("sha256").update(content).digest("hex") };
  });
}
