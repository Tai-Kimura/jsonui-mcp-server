import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServerConfig } from "../../config.js";
import { runCli, formatResult } from "../../cli_runner.js";

export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "doc_generate_html",
    "Generate HTML documentation site with index from a directory of test files",
    {
      input_dir: z.string().describe("Directory containing .test.json files"),
      output_dir: z.string().optional().describe("Output directory for HTML files"),
      title: z.string().optional().describe("Documentation title"),
      project_dir: z.string().optional().describe("Project directory (overrides JUI_PROJECT_DIR env)"),
    },
    async (params) => {
      try {
        const projectDir = config.resolveProjectDir(params.project_dir);
        const args = ["generate", "html", params.input_dir];
        if (params.output_dir) { args.push("-o", params.output_dir); }
        if (params.title) { args.push("-t", params.title); }

        const result = await runCli("jsonui-doc", args, { cwd: projectDir });
        return { content: [{ type: "text", text: formatResult(result) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }] };
      }
    }
  );
}
