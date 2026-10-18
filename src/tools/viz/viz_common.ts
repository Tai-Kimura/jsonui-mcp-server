import { homedir } from "os";
import { runCli, CliResult } from "../../cli_runner.js";

/**
 * Shared by the viz_* tools (`jui viz`, the local viewer of Claude Code
 * sessions). jui viz reads ~/.claude and ~/.jsonui-cli/viz, not a project, so
 * every call runs in the home folder — never JUI_PROJECT_DIR.
 */

/** Said in every viz_* description: other agents' sessions (Codex, …) are not shown. */
export const CLAUDE_CODE_ONLY =
  "jui viz shows Claude Code sessions only (Claude Code のセッションだけを見せる).";

export const UPDATE_JUI =
  "curl -fsSL https://raw.githubusercontent.com/Tai-Kimura/jsonui-cli/main/installer/bootstrap.sh | bash";

/**
 * The installed jui predates what the tool asks for. Matched on argparse's
 * own words, as printed by the jui versions that lack each piece (measured
 * 2026-10-18: jui 1.9.37 has no `viz`; feature/jui-viz before `start` has
 * neither `start` nor `status --with-relay`).
 */
const OUTDATED: { pattern: RegExp; missing: string }[] = [
  { pattern: /invalid choice: 'viz'/, missing: "`jui viz`" },
  { pattern: /invalid choice: 'start'/, missing: "`jui viz start`" },
  { pattern: /unrecognized arguments: .*--with-relay/, missing: "`jui viz status --with-relay`" },
];

export function outdatedJui(result: CliResult): string | undefined {
  const hit = OUTDATED.find((o) => o.pattern.test(result.stderr));
  if (!hit) return undefined;
  return `The installed jui has no ${hit.missing}. Update jui, then call this tool again: ${UPDATE_JUI}`;
}

export async function runViz(args: string[], timeout?: number): Promise<CliResult> {
  return runCli("jui", ["viz", ...args], { cwd: homedir(), timeout });
}

/** The tool's text: the CLI's JSON (when it printed one) inside the usual envelope. */
export function vizResult(result: CliResult): string {
  let parsed: unknown = undefined;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    // not JSON (stop / open print a line)
  }
  const notInstalled = (result.exitCode as unknown) === "ENOENT";
  return JSON.stringify(
    {
      success: result.exitCode === 0,
      result: parsed,
      output: parsed === undefined ? result.stdout || undefined : undefined,
      errors: result.stderr || undefined,
      update_jui: notInstalled
        ? `jui is not installed (not found on PATH). Install it: ${UPDATE_JUI}`
        : outdatedJui(result),
    },
    null,
    2
  );
}
