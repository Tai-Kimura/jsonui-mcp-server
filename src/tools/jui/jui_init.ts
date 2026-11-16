import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServerConfig } from "../../config.js";
import { runCli, formatResult } from "../../cli_runner.js";

export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "jui_init",
    "Initialize a new JsonUI project (creates jui.config.json and directory structure)",
    {
      project_name: z.string().describe("Project name"),
      ios_path: z.string().optional().describe("iOS project root relative path"),
      ios_mode: z.enum(["swiftui", "uikit", "all"]).optional().describe("iOS rendering mode (default: swiftui)"),
      android_path: z.string().optional().describe("Android project root relative path"),
      android_mode: z.enum(["compose", "xml"]).optional().describe("Android rendering mode (default: compose)"),
      package_name: z.string().optional().describe("Android package name (e.g., com.example.app)"),
      web_path: z.string().optional().describe("Web project root relative path"),
      project_dir: z.string().optional().describe("Project directory (overrides JUI_PROJECT_DIR env)"),
    },
    async (params) => {
      try {
        const projectDir = config.resolveProjectDir(params.project_dir);
        const args = ["init", "--project-name", params.project_name];
        if (params.ios_path) { args.push("--ios", params.ios_path); }
        if (params.ios_mode) { args.push("--ios-mode", params.ios_mode); }
        if (params.android_path) { args.push("--android", params.android_path); }
        if (params.android_mode) { args.push("--android-mode", params.android_mode); }
        if (params.package_name) { args.push("--package-name", params.package_name); }
        if (params.web_path) { args.push("--web", params.web_path); }

        const result = await runCli("jui", args, { cwd: projectDir });
        return { content: [{ type: "text", text: formatResult(result) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }] };
      }
    }
  );
}
