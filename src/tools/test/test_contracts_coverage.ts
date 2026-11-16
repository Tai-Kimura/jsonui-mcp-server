import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServerConfig } from "../../config.js";
import { runCli, CliResult } from "../../cli_runner.js";

// The CLI decides the verdict; this tool only carries it. Its exit is the
// verdict itself — 0 pass (or empty), 1 uncovered or a declaration error,
// 2 cannot start, 3 something could not be evaluated — so a failure of the
// TOOL must never be reported as one of those numbers. A timeout reported as
// exit 1 would read as "uncovered".
const MIN_CLI = "1.8.116";

export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "test_contracts_coverage",
    "For every screen and platform, bucket every response status the OpenAPI " +
      "declares for an operation the screen's dataFlow names: answered by a " +
      "branch row, excluded with a reason (unit / unreachable / unexpressible), " +
      "not evaluated, or uncovered (partial / default-only / unattributed). " +
      "Endpoints listed only in dataFlow.apiEndpoints are named as unbound. " +
      "Read-only, and not a gate yet. Returns the CLI's JSON report; its `exit` " +
      "is the verdict: 0 pass (or empty), 1 uncovered or a declaration error, " +
      "2 cannot start, 3 something could not be evaluated and nothing is " +
      `uncovered. Needs jsonui-cli ${MIN_CLI} or later`,
    {
      screen: z
        .string()
        .optional()
        .describe("One screen (the spec's snake_case name); every screen when omitted"),
      platform: z
        .array(z.enum(["web", "android", "ios"]))
        .optional()
        .describe("Platforms to evaluate (default: the platforms jui.config.json declares)"),
      project_dir: z.string().optional().describe("Project directory (overrides JUI_PROJECT_DIR env)"),
    },
    async (params) => {
      try {
        const projectDir = config.resolveProjectDir(params.project_dir);
        const args = ["contracts", "coverage"];
        if (params.screen) { args.push(params.screen); }
        for (const p of params.platform ?? []) { args.push("--platform", p); }
        args.push("--json");
        const result = await runCli("jsonui-test", args, { cwd: projectDir, timeout: 180_000 });
        return { content: [{ type: "text", text: coverageEnvelope(result) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }] };
      }
    }
  );
}

/**
 * The CLI's JSON verbatim when there is one and its `exit` is the process's.
 * Otherwise an envelope that says which of the two is missing — with `exit`
 * set only where the CLI's own meaning applies (2: it could not start).
 */
export function coverageEnvelope(result: CliResult): string {
  const text = result.stdout.trim();
  let report: any;
  try {
    report = JSON.parse(text);
  } catch {
    report = undefined;
  }
  if (report && typeof report === "object" && typeof report.exit === "number") {
    if (report.exit === result.exitCode) {
      return text;
    }
    return JSON.stringify(
      {
        exit: null,
        verdict: "no_report",
        error: `the report says exit ${report.exit} but the process exited ${String(result.exitCode)}`,
        report,
      },
      null,
      2
    );
  }
  const errors = result.stderr || undefined;
  if (result.exitCode === ("ENOENT" as any)) {
    return JSON.stringify(
      {
        exit: 2,
        verdict: "cannot_start",
        error: `jsonui-test is not on PATH — install jsonui-cli ${MIN_CLI} or later`,
      },
      null,
      2
    );
  }
  if (result.exitCode === 2 && /invalid choice: 'contracts'/.test(result.stderr)) {
    return JSON.stringify(
      {
        exit: 2,
        verdict: "cannot_start",
        error: `this jsonui-test has no \`contracts coverage\` — it arrived in jsonui-cli ${MIN_CLI}`,
        errors,
      },
      null,
      2
    );
  }
  return JSON.stringify(
    {
      exit: null,
      verdict: "no_report",
      error: `no JSON report (process exit ${String(result.exitCode)})`,
      output: result.stdout || undefined,
      errors,
    },
    null,
    2
  );
}
