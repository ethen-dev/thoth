export * from "./config.js";
export * from "./types.js";
export * from "./runtime.js";

export type ThothActionResult = {
  status: "ok" | "error";
  message: string;
};
