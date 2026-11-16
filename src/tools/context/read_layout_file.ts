import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { ServerConfig } from "../../config.js";

export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "read_layout_file",
    "Read the contents of a Layout JSON file from the shared layouts directory",
    {
      file: z.string().describe("Filename (e.g., 'Login.json' or 'Styles/Common.json')"),
      project_dir: z.string().optional().describe("Project directory (overrides JUI_PROJECT_DIR env)"),
    },
    async ({ file, project_dir }) => {
      try {
        const projectDir = config.resolveProjectDir(project_dir);
        const projectConfig = config.readProjectConfig(projectDir);
        const layoutsDir = config.resolveDir(projectConfig, "layouts_directory", projectDir);
        const filePath = join(layoutsDir, file);

        config.validatePathInProject(filePath, projectDir);

        if (!existsSync(filePath)) {
          return { content: [{ type: "text", text: `File not found: ${filePath}` }] };
        }

        const content = readFileSync(filePath, "utf-8");
        return { content: [{ type: "text", text: content }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }] };
      }
    }
  );
}
