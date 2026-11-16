import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServerConfig } from "../../config.js";
import { runCli, formatResult } from "../../cli_runner.js";

export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "doc_rules_init",
    "Create a template .jsonui-doc-rules.json configuration file for custom validation rules",
    {
      flutter: z.boolean().optional().describe("Include Flutter-specific rules"),
      output_dir: z.string().optional().describe("Output directory for rules file"),
      project_dir: z.string().optional().describe("Project directory (overrides JUI_PROJECT_DIR env)"),
    },
    async (params) => {
      try {
        const projectDir = config.resolveProjectDir(params.project_dir);
        const args = ["rules", "init"];
        if (params.flutter) { args.push("--flutter"); }
        if (params.output_dir) { args.push("-o", params.output_dir); }

        const result = await runCli("jsonui-doc", args, { cwd: projectDir });
        return { content: [{ type: "text", text: formatResult(result) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }] };
      }
    }
  );
}
