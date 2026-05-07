import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readdirSync, existsSync } from "fs";
import { join } from "path";
import { ServerConfig } from "../../config.js";

export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "list_layouts",
    "List all Layout JSON files in the shared layouts directory",
    {
      project_dir: z.string().optional().describe("Project directory (overrides JUI_PROJECT_DIR env)"),
    },
    async ({ project_dir }) => {
      try {
        const projectDir = config.resolveProjectDir(project_dir);
        const projectConfig = config.readProjectConfig(projectDir);
        const layoutsDir = config.resolveDir(projectConfig, "layouts_directory", projectDir);

        if (!existsSync(layoutsDir)) {
          return { content: [{ type: "text", text: `Layouts directory not found: ${layoutsDir}` }] };
        }

        const collectJsonFiles = (dir: string, prefix: string = ""): string[] => {
          const entries = readdirSync(dir, { withFileTypes: true });
          const files: string[] = [];
          for (const entry of entries) {
            const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
            if (entry.isDirectory()) {
              files.push(...collectJsonFiles(join(dir, entry.name), relPath));
            } else if (entry.name.endsWith(".json")) {
              files.push(relPath);
            }
          }
          return files;
        };

        const files = collectJsonFiles(layoutsDir);
        return { content: [{ type: "text", text: JSON.stringify(files, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }] };
      }
    }
  );
}
