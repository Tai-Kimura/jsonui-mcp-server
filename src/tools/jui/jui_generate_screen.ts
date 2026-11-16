import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServerConfig } from "../../config.js";
import { runCli, formatResult } from "../../cli_runner.js";

export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "jui_generate_screen",
    "Create screen spec template files for new screens",
    {
      names: z.array(z.string()).describe("Screen names in PascalCase (e.g., ['LoginScreen', 'RegisterScreen'])"),
      display_name: z.string().optional().describe("Display name (for single screen only)"),
      project_dir: z.string().optional().describe("Project directory (overrides JUI_PROJECT_DIR env)"),
    },
    async (params) => {
      try {
        const projectDir = config.resolveProjectDir(params.project_dir);
        const args = ["generate", "screen", ...params.names];
        if (params.display_name) { args.push("--display-name", params.display_name); }

        const result = await runCli("jui", args, { cwd: projectDir });
        return { content: [{ type: "text", text: formatResult(result) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }] };
      }
    }
  );
}
