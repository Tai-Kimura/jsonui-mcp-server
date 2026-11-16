import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { join } from "path";
import { ServerConfig } from "../../config.js";
import { runCli } from "../../cli_runner.js";

export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "doc_validate_component",
    "Validate a component specification JSON file against the schema",
    {
      file: z.string().describe("Component spec file path (e.g., 'my_card.component.json' or full path)"),
      project_dir: z.string().optional().describe("Project directory (overrides JUI_PROJECT_DIR env)"),
    },
    async (params) => {
      try {
        const projectDir = config.resolveProjectDir(params.project_dir);
        let filePath = params.file;

        if (!filePath.startsWith("/") && !filePath.includes("/")) {
          try {
            const projectConfig = config.readProjectConfig(projectDir);
            const compDir = config.resolveDir(projectConfig, "component_spec_directory", projectDir);
            filePath = join(compDir, filePath);
          } catch {
            filePath = join(projectDir, filePath);
          }
        }

        const result = await runCli("jsonui-doc", ["validate", "component", filePath], { cwd: projectDir });
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
