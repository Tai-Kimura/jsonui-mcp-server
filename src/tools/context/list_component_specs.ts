import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { ServerConfig } from "../../config.js";

export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "list_component_specs",
    "List all component spec files (*.component.json) with metadata",
    {
      project_dir: z.string().optional().describe("Project directory (overrides JUI_PROJECT_DIR env)"),
    },
    async ({ project_dir }) => {
      try {
        const projectDir = config.resolveProjectDir(project_dir);
        const projectConfig = config.readProjectConfig(projectDir);
        const compDir = config.resolveDir(projectConfig, "component_spec_directory", projectDir);

        if (!existsSync(compDir)) {
          return { content: [{ type: "text", text: `Component spec directory not found: ${compDir}` }] };
        }

        const files = readdirSync(compDir).filter((f) => f.endsWith(".component.json"));
        const specs = files.map((file) => {
          try {
            const data = JSON.parse(readFileSync(join(compDir, file), "utf-8"));
            return {
              file,
              name: data.metadata?.name || file.replace(".component.json", ""),
              category: data.metadata?.category || "",
            };
          } catch {
            return { file, name: file.replace(".component.json", ""), category: "unknown" };
          }
        });

        return { content: [{ type: "text", text: JSON.stringify(specs, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }] };
      }
    }
  );
}
