import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { join } from "path";
import { ServerConfig } from "../../config.js";
import { runCli, formatResult } from "../../cli_runner.js";

export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "doc_generate_spec",
    "Generate HTML or Markdown documentation from a screen spec file (or batch from a directory)",
    {
      file: z.string().describe("Spec file or directory path (e.g., 'login.spec.json' or 'docs/screens/json')"),
      output: z.string().optional().describe("Output file or directory path"),
      format: z.enum(["html", "markdown"]).optional().describe("Output format (default: html)"),
      project_dir: z.string().optional().describe("Project directory (overrides JUI_PROJECT_DIR env)"),
    },
    async (params) => {
      try {
        const projectDir = config.resolveProjectDir(params.project_dir);
        let filePath = params.file;

        if (!filePath.startsWith("/") && !filePath.includes("/")) {
          try {
            const projectConfig = config.readProjectConfig(projectDir);
            const specDir = config.resolveDir(projectConfig, "spec_directory", projectDir);
            filePath = join(specDir, filePath);
          } catch {
            filePath = join(projectDir, filePath);
          }
        }

        const args = ["generate", "spec", filePath];
        if (params.output) { args.push("-o", params.output); }
        if (params.format) { args.push("--format", params.format); }

        const result = await runCli("jsonui-doc", args, { cwd: projectDir });
        return { content: [{ type: "text", text: formatResult(result) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }] };
      }
    }
  );
}
