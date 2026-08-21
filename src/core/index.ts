export { createDefaultConfig, loadConfig, resolveDateFormat, supportedDateFormats } from "./config.js";
export type { AuditConfig, DateFormat, ResolvedThothConfig, ThothConfig } from "./config.js";
export * from "./types.js";
export * from "./runtime.js";
export * from "./query-adapter.js";
export * from "./adapters.js";
export * from "../audit/index.js";

export type ThothActionResult = {
  status: "ok" | "error";
  message: string;
};
