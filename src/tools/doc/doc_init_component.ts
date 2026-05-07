import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServerConfig } from "../../config.js";
import { runCli, formatResult } from "../../cli_runner.js";

export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "doc_init_component",
    "Create a new component specification template file (.component.json)",
    {
      name: z.string().describe("Component name in PascalCase (e.g., 'CustomCard')"),
      display_name: z.string().optional().describe("Display name for the component"),
      category: z.enum(["card", "form", "list", "navigation", "input", "display", "layout", "feedback", "other"]).optional().describe("Component category"),
      output_dir: z.string().optional().describe("Output directory"),
      project_dir: z.string().optional().describe("Project directory (overrides JUI_PROJECT_DIR env)"),
    },
    async (params) => {
      try {
        const projectDir = config.resolveProjectDir(params.project_dir);
        const args = ["init", "component", params.name];
        if (params.display_name) { args.push("-d", params.display_name); }
        if (params.category) { args.push("-c", params.category); }
        if (params.output_dir) { args.push("-o", params.output_dir); }

        const result = await runCli("jsonui-doc", args, { cwd: projectDir });
        return { content: [{ type: "text", text: formatResult(result) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }] };
      }
    }
  );
}
