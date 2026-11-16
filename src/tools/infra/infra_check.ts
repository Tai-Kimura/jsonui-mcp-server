import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServerConfig } from "../../config.js";
import { FIRST, failure, need, runDocJson, text } from "./infra_common.js";

/**
 * `jsonui-doc check infra -p <project> --json`: the declared infra checks (jui.config.json → checks:
 * builtin:infra-iac, builtin:infra-code, builtin:infra-load) — the model against the IaC, the code, and the load
 * definitions. This is the one jsonui-doc command that runs project-declared checks; the infra ones read files only.
 * Exit 0: clean (warnings alone are 0); 1: a mismatch (a finding of a check declared with gate: true); 2: an
 * execution error, or no infra check is declared.
 */
export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "infra_check",
    "Run the project's declared infra checks with `jsonui-doc check infra --json` (jui.config.json → checks: builtin:infra-iac = the model against Terraform/Compose/CloudFormation/k8s/wrangler, builtin:infra-code = against the code's evidence, SDK imports and env names, builtin:infra-load = against the load definitions). Returns each check's status (ok / mismatch / error), counts, the first 20 results that are not ok (target, status, expected, actual, message), warnings, and its report file. Findings are warnings unless the check sets gate: true. Needs jsonui-cli 2.3.15+.",
    {
      project_dir: z.string().optional().describe("Project directory with jui.config.json (overrides JUI_PROJECT_DIR env)"),
    },
    async ({ project_dir }) => {
      try {
        const projectDir = config.resolveProjectDir(project_dir);
        const { exitCode, data, stderr } = await runDocJson(["check", "infra", "-p", projectDir, "--json"], projectDir, 180_000);
        need(data, ["ok", "exit", "checks"], "check infra");
        if (!data.checks.length) {
          return text({ ok: false, exit: exitCode, checks: [],
            message: stderr.trim() || "no builtin:infra-* check is declared in jui.config.json → checks",
            declared: data.declared ?? [] });
        }
        return text({
          ok: data.ok,
          exit: exitCode,
          checks: data.checks.map((c: any) => {
            need(c, ["name", "type", "status"], "check infra check");
            if (c.status === "error") return { name: c.name, type: c.type, status: "error", error: c.error };
            need(c, ["summary", "results", "warnings", "report"], "check infra check");
            return {
              name: c.name, type: c.type, status: c.status, summary: c.summary,
              results: c.results.slice(0, FIRST), resultCount: c.results.length,
              warnings: c.warnings.slice(0, FIRST), report: c.report,
            };
          }),
        });
      } catch (e: any) {
        return failure(e);
      }
    }
  );
}
