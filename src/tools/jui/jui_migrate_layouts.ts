import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServerConfig } from "../../config.js";
import { runCli, formatResult } from "../../cli_runner.js";

export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "jui_migrate_layouts",
    "Copy existing platform layouts to the shared layouts directory",
    {
      source_platform: z.enum(["ios", "android", "web"]).optional().describe("Platform to copy from (default: ios)"),
      dry_run: z.boolean().optional().describe("Show what would be copied without executing"),
      project_dir: z.string().optional().describe("Project directory (overrides JUI_PROJECT_DIR env)"),
    },
    async (params) => {
      try {
        const projectDir = config.resolveProjectDir(params.project_dir);
        const args = ["migrate-layouts"];
        if (params.source_platform) { args.push("--from", params.source_platform); }
        if (params.dry_run) { args.push("--dry-run"); }

        const result = await runCli("jui", args, { cwd: projectDir });
        return { content: [{ type: "text", text: formatResult(result) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }] };
      }
    }
  );
}
