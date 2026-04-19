import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServerConfig } from "../../config.js";
import { runCli, formatResult } from "../../cli_runner.js";

export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "jui_build",
    "Distribute layouts/strings/images to all platforms and run platform builds (sjui/kjui/rjui build)",
    {
      clean: z.boolean().optional().describe("Clean build (regenerate all)"),
      platform: z.enum(["ios", "android", "web"]).optional().describe("Build single platform only"),
      project_dir: z.string().optional().describe("Project directory (overrides JUI_PROJECT_DIR env)"),
    },
    async (params) => {
      try {
        const projectDir = config.resolveProjectDir(params.project_dir);
        const args = ["build"];
        if (params.clean) { args.push("--clean"); }
        if (params.platform === "ios") { args.push("--ios-only"); }
        if (params.platform === "android") { args.push("--android-only"); }
        if (params.platform === "web") { args.push("--web-only"); }

        const result = await runCli("jui", args, { cwd: projectDir, timeout: 300_000 });
        return { content: [{ type: "text", text: formatResult(result) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }] };
      }
    }
  );
}
