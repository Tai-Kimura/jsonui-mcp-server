import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { ServerConfig } from "../../config.js";

export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "list_screen_specs",
    "List all screen spec files (*.spec.json) with metadata (name, displayName, type)",
    {
      project_dir: z.string().optional().describe("Project directory (overrides JUI_PROJECT_DIR env)"),
    },
    async ({ project_dir }) => {
      try {
        const projectDir = config.resolveProjectDir(project_dir);
        const projectConfig = config.readProjectConfig(projectDir);
        const specDir = config.resolveDir(projectConfig, "spec_directory", projectDir);

        if (!existsSync(specDir)) {
          return { content: [{ type: "text", text: `Spec directory not found: ${specDir}` }] };
        }

        const files = readdirSync(specDir).filter((f) => f.endsWith(".spec.json"));
        const specs: any[] = [];
        for (const file of files) {
          try {
            const data = JSON.parse(readFileSync(join(specDir, file), "utf-8"));
            specs.push({
              file,
              name: data.metadata?.name || file.replace(".spec.json", ""),
              displayName: data.metadata?.displayName || "",
              type: data.type || "screen_spec",
              layoutFile: data.metadata?.layoutFile || null,
            });
            // A parent spec splits one screen across sub-spec files (its
            // 'subSpecs' array). Surface them inline so a session can see
            // the split and read_spec_file the right part without first
            // opening the parent.
            if (Array.isArray(data.subSpecs)) {
              for (const sub of data.subSpecs) {
                if (!sub?.file) continue;
                specs.push({
                  file: sub.file,
                  name: sub.name || sub.file,
                  displayName: sub.description || "",
                  type: "screen_sub_spec",
                  parent: file,
                  layoutFile: data.metadata?.layoutFile || null,
                });
              }
            }
          } catch {
            specs.push({ file, name: file.replace(".spec.json", ""), displayName: "", type: "unknown", layoutFile: null });
          }
        }

        return { content: [{ type: "text", text: JSON.stringify(specs, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }] };
      }
    }
  );
}
