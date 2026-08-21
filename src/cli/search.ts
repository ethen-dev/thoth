import { queryThroughCore, type QueryAdapterInput, type QuerySummary } from "../core/index.js";
import type { ResolvedThothConfig } from "../core/config.js";

export async function runCliSearch(config: ResolvedThothConfig, input: QueryAdapterInput): Promise<QuerySummary[]> {
  return queryThroughCore(config, input, "cli");
}

export function formatCliSearch(results: QuerySummary[]): string {
  if (results.length === 0) return "No wiki documents matched.";
  return results.map((result) => `${result.id}\t${result.type}\t${result.status}\t${result.title}\t${result.path}\n  ${result.snippet}`).join("\n");
}
