export * from "./config.js";

export type ThothActionResult = {
  status: "ok" | "error";
  message: string;
};
