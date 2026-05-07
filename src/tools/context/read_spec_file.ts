import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { ServerConfig } from "../../config.js";

export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "read_spec_file",
    "Read the contents of a screen or component spec file",
    {
      file: z.string().describe("Filename (e.g., 'login.spec.json' or 'my_card.component.json')"),
      project_dir: z.string().optional().describe("Project directory (overrides JUI_PROJECT_DIR env)"),
    },
    async ({ file, project_dir }) => {
      try {
        const projectDir = config.resolveProjectDir(project_dir);
        const projectConfig = config.readProjectConfig(projectDir);

        const isComponent = file.endsWith(".component.json");
        const dirField = isComponent ? "component_spec_directory" : "spec_directory";
        const baseDir = config.resolveDir(projectConfig, dirField, projectDir);
        const filePath = join(baseDir, file);

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
