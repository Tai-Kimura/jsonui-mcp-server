import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServerConfig } from "../../config.js";
import { runCli, formatResult } from "../../cli_runner.js";

export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "doc_init_spec",
    "Create a new screen specification template file (.spec.json)",
    {
      name: z.string().describe("Screen name in PascalCase (e.g., 'LoginScreen')"),
      display_name: z.string().optional().describe("Display name for the screen"),
      output_dir: z.string().optional().describe("Output directory (defaults to spec_directory in config)"),
      project_dir: z.string().optional().describe("Project directory (overrides JUI_PROJECT_DIR env)"),
    },
    async (params) => {
      try {
        const projectDir = config.resolveProjectDir(params.project_dir);
        const args = ["init", "spec", params.name];
        if (params.display_name) { args.push("-d", params.display_name); }
        if (params.output_dir) { args.push("-o", params.output_dir); }

        const result = await runCli("jsonui-doc", args, { cwd: projectDir });
        return { content: [{ type: "text", text: formatResult(result) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }] };
      }
    }
  );
}
