import { runCli } from "../../cli_runner.js";

/**
 * Shared by the Group H tools: run a `jsonui-doc … --json` infra command and read its one JSON object.
 *
 * The tools summarise that object for an agent (counts, the first problems, the totals), so the keys they read are
 * the CLI's contract. `need` names a key the object lacks instead of summarising nothing — a jsonui-doc older or
 * newer than these tools says so rather than reading as an empty room. The tests feed the CLI's own recorded output
 * (tests/fixtures/infra, scripts/record-infra-fixtures.sh).
 */

export interface JsonRun {
  exitCode: number;
  data: any;
  stderr: string;
}

export class ContractError extends Error {}

export const FIRST = 20;

export async function runDocJson(args: string[], cwd: string, timeout?: number): Promise<JsonRun> {
  const result = await runCli("jsonui-doc", args, { cwd, timeout });
  let data: any;
  try {
    data = JSON.parse(result.stdout);
  } catch {
    throw new ContractError(
      `jsonui-doc ${args.slice(0, 2).join(" ")} printed no JSON (exit ${result.exitCode})` +
        (result.stderr ? `: ${result.stderr.trim().split("\n").slice(-3).join(" / ")}` : "") +
        " — it needs jsonui-cli 2.3.15 or later for --json here"
    );
  }
  return { exitCode: result.exitCode, data, stderr: result.stderr };
}

export function need(obj: any, keys: string[], what: string): void {
  const missing = keys.filter((k) => obj == null || !(k in obj));
  if (missing.length) {
    throw new ContractError(
      `${what}: the JSON has no ${missing.map((k) => `"${k}"`).join(", ")} — a jsonui-doc these tools do not know; ` +
        "update jsonui-cli or this server"
    );
  }
}

/** A problem list as counts (by severity, by code) and the first FIRST, each as written. */
export function problems(list: any[], what: string, keep: string[] = ["severity", "code", "file", "path", "message"]) {
  if (!Array.isArray(list)) throw new ContractError(`${what}: "problems" is not a list`);
  const bySeverity: Record<string, number> = {};
  const byCode: Record<string, number> = {};
  for (const p of list) {
    need(p, ["severity", "code"], `${what} problem`);
    bySeverity[p.severity] = (bySeverity[p.severity] ?? 0) + 1;
    byCode[p.code] = (byCode[p.code] ?? 0) + 1;
  }
  const first = list.slice(0, FIRST).map((p) =>
    Object.fromEntries(keep.filter((k) => p[k] !== undefined && p[k] !== null).map((k) => [k, p[k]]))
  );
  return { count: list.length, errors: bySeverity.error ?? 0, warnings: bySeverity.warning ?? 0, byCode, first };
}

export function text(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

export function failure(e: any) {
  return { content: [{ type: "text" as const, text: `Error: ${e.message}` }] };
}
