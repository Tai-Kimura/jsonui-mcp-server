import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServerConfig } from "../../config.js";
import { failure, need, problems, runDocJson, text } from "./infra_common.js";

/**
 * `jsonui-doc validate infra-prices <project> --json`: the room's own price files (<infra.dir>/prices, or
 * infra.prices_dir). Exit 0: no error; 1: errors; 2: the folder cannot be read (reason).
 */
export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "infra_prices_validate",
    "Validate the server room's own price files (docs/infra/prices/*.json — only for what the bundled prices lack) with `jsonui-doc validate infra-prices --json`. Returns the files used, how many prices, and the problems by severity and code with the first 20. Needs jsonui-cli 2.3.15+.",
    {
      project_dir: z.string().optional().describe("Project directory with jui.config.json (overrides JUI_PROJECT_DIR env)"),
    },
    async ({ project_dir }) => {
      try {
        const projectDir = config.resolveProjectDir(project_dir);
        const { exitCode, data } = await runDocJson(["validate", "infra-prices", projectDir, "--json"], projectDir);
        need(data, ["ok"], "validate infra-prices");
        if (!data.ok) {
          need(data, ["reason", "message"], "validate infra-prices");
          return text({ ok: false, exit: exitCode, readable: false, reason: data.reason, message: data.message });
        }
        need(data, ["dir", "files", "problems", "count"], "validate infra-prices");
        return text({
          ok: exitCode === 0,
          exit: exitCode,
          readable: true,
          dir: data.dir,
          files: data.files,
          count: data.count,
          problems: problems(data.problems, "validate infra-prices"),
        });
      } catch (e: any) {
        return failure(e);
      }
    }
  );
}
