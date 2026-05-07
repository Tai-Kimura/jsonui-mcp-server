import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { join } from "path";
import { ServerConfig } from "../../config.js";
import { runCli } from "../../cli_runner.js";

export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "doc_validate_spec",
    "Validate a screen specification JSON file against the schema",
    {
      file: z.string().describe("Spec file path (e.g., 'login.spec.json' or full path)"),
      project_dir: z.string().optional().describe("Project directory (overrides JUI_PROJECT_DIR env)"),
    },
    async (params) => {
      try {
        const projectDir = config.resolveProjectDir(params.project_dir);
        let filePath = params.file;

        // If relative and doesn't contain directory separator, resolve from spec_directory
        if (!filePath.startsWith("/") && !filePath.includes("/")) {
          try {
            const projectConfig = config.readProjectConfig(projectDir);
            const specDir = config.resolveDir(projectConfig, "spec_directory", projectDir);
            filePath = join(specDir, filePath);
          } catch {
            filePath = join(projectDir, filePath);
          }
        }

        const result = await runCli("jsonui-doc", ["validate", "spec", filePath], { cwd: projectDir });
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: result.exitCode === 0,
              is_valid: result.exitCode === 0,
              output: result.stdout,
              errors: result.stderr || undefined,
            }, null, 2),
          }],
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }] };
      }
    }
  );
}
