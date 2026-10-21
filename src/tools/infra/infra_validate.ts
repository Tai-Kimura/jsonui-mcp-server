import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServerConfig } from "../../config.js";
import { failure, need, problems, runDocJson, text } from "./infra_common.js";

/**
 * `jsonui-doc validate infra <project> --json`: the room's model (docs/infra/*.json, or jui.config.json's infra.dir)
 * read as jui viz reads it — each file against the schema and the shapes of secrets, then merged, and its flows
 * walked. Exit 0: no error (warnings alone are 0); 1: errors; 2: nothing could be read (reason).
 */
export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "infra_validate",
    "Validate the server room's infra model (docs/infra/*.json: environments, groups, nodes, edges, flows) with `jsonui-doc validate infra --json`. Returns whether it could be read (and why not), the files used, the counts, and the problems by severity and code with the first 20 (file, path, code, message). Flow problems (flow.*) name the rule a step most likely missed. Needs jsonui-cli 2.3.15+.",
    {
      project_dir: z.string().optional().describe("Project directory with jui.config.json (overrides JUI_PROJECT_DIR env)"),
    },
    async ({ project_dir }) => {
      try {
        const projectDir = config.resolveProjectDir(project_dir);
        const { exitCode, data } = await runDocJson(["validate", "infra", projectDir, "--json"], projectDir);
        need(data, ["ok"], "validate infra");
        if (!data.ok && data.reason !== "invalid") {
          need(data, ["reason", "message"], "validate infra");
          return text({ ok: false, exit: exitCode, readable: false, reason: data.reason, message: data.message });
        }
        need(data, ["dir", "files", "problems"], "validate infra");
        return text({
          ok: exitCode === 0,
          exit: exitCode,
          readable: data.ok,
          dir: data.dir,
          files: data.files,
          environments: (data.environments ?? []).map((e: any) => e.id),
          counts: data.counts ?? null,
          flows: Array.isArray(data.flows) ? data.flows.length : null,
          problems: problems(data.problems, "validate infra"),
        });
      } catch (e: any) {
        return failure(e);
      }
    }
  );
}
