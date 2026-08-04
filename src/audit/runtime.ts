import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import type { ResolvedThothConfig } from "../core/config.js";
import { appendTextToFile, withWorkspaceLock } from "../storage/filesystem.js";

export type AuditSurface = "core" | "cli" | "mcp" | "skill" | "agent";
export type AuditOutcome = "planned" | "proposed" | "confirmed" | "executed" | "rejected" | "error";
export type AuditEvent = {
  id: string; timestamp: string; operation: string; surface: AuditSurface; actor: string;
  result: AuditOutcome; affectedIds: string[]; durationMs: number; error?: { code?: string; message: string };
};
export type AuditWarning = { code: "audit_write_failed"; message: string };

const defaultMaxStringLength = 500;
const defaultMaxEntryBytes = 16_384;
const sensitiveKey = /(token|password|secret|credential|authorization|content|prompt|raw)/i;
const auditSchemaPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../schemas/audit-event.schema.json");
let validatorPromise: Promise<ValidateFunction> | undefined;

export async function recordAudit(config: ResolvedThothConfig, event: Omit<AuditEvent, "id" | "timestamp">): Promise<AuditWarning | undefined> {
  if (config.audit?.enabled === false) return undefined;
  try {
    const safe: AuditEvent = {
      ...event,
      id: randomUUID(),
      timestamp: formatTimestamp(new Date(), config.dateFormat),
      actor: redact(event.actor, config),
      affectedIds: event.affectedIds.slice(0, 50).map((id) => redact(id, config)),
      operation: redact(event.operation, config),
      error: event.error ? { code: redact(event.error.code ?? "", config), message: redact(event.error.message, config) } : undefined,
    };
    const line = JSON.stringify(safe);
    const max = config.audit?.maxEntryBytes ?? defaultMaxEntryBytes;
    if (Buffer.byteLength(line, "utf8") > max) throw new Error(`Audit event exceeds ${max} bytes`);
    const target = auditPath(config);
    await withWorkspaceLock(config.workspacePath, () => appendTextToFile(target, `${line}\n`, { workspaceRoot: config.workspacePath }), 250);
    return undefined;
  } catch (error) {
    return { code: "audit_write_failed", message: error instanceof Error ? error.message : String(error) };
  }
}

export async function listAuditEvents(config: ResolvedThothConfig, limit = 100): Promise<AuditEvent[]> {
  validateAuditLimit(limit);
  try { return (await readFile(auditPath(config), "utf8")).split(/\r?\n/).filter(Boolean).slice(-Math.max(1, Math.min(limit, 1000))).map((line) => JSON.parse(line) as AuditEvent); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
}

export async function verifyAudit(config: ResolvedThothConfig): Promise<{ valid: boolean; entries: number; errors: string[] }> {
  try {
    const lines = (await readFile(auditPath(config), "utf8")).split(/\r?\n/).filter(Boolean);
    const errors: string[] = [];
    const validate = await auditValidator();
    lines.forEach((line, index) => {
      try {
        const event = JSON.parse(line);
        if (!validate(event)) errors.push(`line ${index + 1}: ${formatAjvErrors(validate.errors)}`);
      } catch (error) { errors.push(`line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`); }
    });
    return { valid: errors.length === 0, entries: lines.length, errors };
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { valid: true, entries: 0, errors: [] }; throw error; }
}

export function auditPath(config: ResolvedThothConfig): string {
  return config.audit?.path ? path.resolve(config.workspacePath, config.audit.path) : path.join(config.resolvedWikiPath, "logs", "audit.jsonl");
}

export function validateAuditLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error("Audit limit must be an integer between 1 and 1000");
}

export function redactAuditValue(value: unknown, config: ResolvedThothConfig, key?: string): unknown {
  if (key && isSensitiveKey(key, config)) return "[REDACTED]";
  if (typeof value === "string") return redactString(value, config);
  if (Array.isArray(value)) return value.map((entry) => redactAuditValue(entry, config));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([entryKey, entry]) => [entryKey, redactAuditValue(entry, config, entryKey)]));
  return value;
}

function redact(value: string, config: ResolvedThothConfig): string {
  return redactString(value, config);
}
function redactString(value: string, config: ResolvedThothConfig): string {
  const max = config.audit?.maxStringLength ?? defaultMaxStringLength;
  return value.replace(/(Bearer\s+)[^\s]+/gi, "$1[REDACTED]").slice(0, max);
}
function isSensitiveKey(key: string, config: ResolvedThothConfig): boolean {
  return sensitiveKey.test(key) || (config.audit?.redactKeys ?? []).some((entry) => entry.toLowerCase() === key.toLowerCase());
}
async function auditValidator(): Promise<ValidateFunction> {
  if (!validatorPromise) validatorPromise = readFile(auditSchemaPath, "utf8").then((raw) => new Ajv2020({ allErrors: true }).addFormat("uuid", /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i).compile(JSON.parse(raw)));
  return validatorPromise;
}
function formatAjvErrors(errors: ErrorObject[] | null | undefined): string {
  return errors?.map((error) => `${error.instancePath || "/"} ${error.message ?? "invalid"}`).join("; ") || "schema validation failed";
}
function formatTimestamp(date: Date, format: string): string {
  const yyyy = String(date.getFullYear()), mm = String(date.getMonth() + 1).padStart(2, "0"), dd = String(date.getDate()).padStart(2, "0");
  if (format === "DD/MM/YYYY") return `${dd}/${mm}/${yyyy}`;
  if (format === "MM/DD/YYYY") return `${mm}/${dd}/${yyyy}`;
  if (format === "YYYY/MM/DD") return `${yyyy}/${mm}/${dd}`;
  return `${yyyy}-${mm}-${dd}`;
}
