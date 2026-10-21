import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServerConfig } from "../../config.js";
import { failure, need, problems, runDocJson, text } from "./infra_common.js";

/**
 * `jsonui-doc validate infra-load <project> --json`: the load scenarios the cost simulator reads (<infra.dir>/load,
 * or infra.load_dir) against their schema and against the model. Exit 0: no error; 1: errors; 2: the model or the
 * folder cannot be read (reason).
 */
export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "infra_load_validate",
    "Validate the server room's load scenarios (docs/infra/load/*.json) with `jsonui-doc validate infra-load --json`. Returns each scenario (id, environment, month, hours, loads, edges) and the problems by severity and code with the first 20 (file, path, code, message, node, hour, quantity). load.overlap means a node has two rows and only one counts. Needs jsonui-cli 2.3.15+.",
    {
      project_dir: z.string().optional().describe("Project directory with jui.config.json (overrides JUI_PROJECT_DIR env)"),
    },
    async ({ project_dir }) => {
      try {
        const projectDir = config.resolveProjectDir(project_dir);
        const { exitCode, data } = await runDocJson(["validate", "infra-load", projectDir, "--json"], projectDir);
        need(data, ["ok"], "validate infra-load");
        if (!data.ok) {
          need(data, ["reason", "message"], "validate infra-load");
          return text({ ok: false, exit: exitCode, readable: false, reason: data.reason, message: data.message });
        }
        need(data, ["dir", "files", "problems", "scenarios"], "validate infra-load");
        for (const s of data.scenarios) need(s, ["id", "environment", "month", "hours", "loads", "edges"], "validate infra-load scenario");
        return text({
          ok: exitCode === 0,
          exit: exitCode,
          readable: true,
          dir: data.dir,
          files: data.files,
          scenarios: data.scenarios.map((s: any) => ({
            id: s.id, file: s.file, environment: s.environment, month: s.month, hours: s.hours, loads: s.loads, edges: s.edges,
          })),
          problems: problems(data.problems, "validate infra-load",
            ["severity", "code", "file", "path", "message", "node", "hour", "quantity"]),
        });
      } catch (e: any) {
        return failure(e);
      }
    }
  );
}
