import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServerConfig } from "../../config.js";
import { runCli, formatResult } from "../../cli_runner.js";

export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "jui_generate_project",
    "Generate Layout JSON and ViewModel files from screen specs (all or single spec)",
    {
      spec_file: z.string().optional().describe("Single spec file to process (e.g., 'login.spec.json')"),
      force: z.boolean().optional().describe("Force overwrite declaration files"),
      skip_layout: z.boolean().optional().describe("Skip Layout JSON generation"),
      dry_run: z.boolean().optional().describe("Show what would be generated without writing"),
      platform: z.enum(["ios", "android", "web"]).optional().describe("Generate for single platform only"),
      project_dir: z.string().optional().describe("Project directory (overrides JUI_PROJECT_DIR env)"),
    },
    async (params) => {
      try {
        const projectDir = config.resolveProjectDir(params.project_dir);
        const args = ["generate", "project"];
        if (params.spec_file) { args.push("--file", params.spec_file); }
        if (params.force) { args.push("--force"); }
        if (params.skip_layout) { args.push("--skip-layout"); }
        if (params.dry_run) { args.push("--dry-run"); }
        if (params.platform === "ios") { args.push("--ios-only"); }
        if (params.platform === "android") { args.push("--android-only"); }
        if (params.platform === "web") { args.push("--web-only"); }

        const result = await runCli("jui", args, { cwd: projectDir, timeout: 120_000 });
        return { content: [{ type: "text", text: formatResult(result) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }] };
      }
    }
  );
}
