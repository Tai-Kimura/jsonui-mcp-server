import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServerConfig } from "../../config.js";
import { runCli, formatResult } from "../../cli_runner.js";

export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "test_generate_flow",
    "Generate a flow test file template via the jsonui-test CLI",
    {
      name: z.string().describe("Flow name (e.g., login, checkout)"),
      path: z.string().optional().describe("Output test file path (default: tests/flows/<name>/<name>.test.json)"),
      platform: z
        .enum(["ios", "ios-swiftui", "ios-uikit", "android", "web", "all"])
        .optional()
        .describe("Target platform"),
      project_dir: z.string().optional().describe("Project directory (overrides JUI_PROJECT_DIR env)"),
    },
    async (params) => {
      try {
        const projectDir = config.resolveProjectDir(params.project_dir);
        const args = ["generate", "test", "flow", params.name];
        if (params.path) { args.push("--path", params.path); }
        if (params.platform) { args.push("--platform", params.platform); }

        const result = await runCli("jsonui-test", args, { cwd: projectDir });
        return { content: [{ type: "text", text: formatResult(result) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }] };
      }
    }
  );
}
