import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServerConfig } from "../../config.js";
import { runCli } from "../../cli_runner.js";

/**
 * Discovery wrapper around `jui ls api-models --json`.
 *
 * Lists generated DTO + Domain scaffold files per platform, plus orphan
 * DTOs whose source schema no longer exists in the current swagger.
 * Agents use this to verify project state before / after `jui build`.
 */
export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "list_api_models",
    "List generated DTO + Domain scaffold files per platform with orphan detection",
    {
      platform: z.enum(["ios", "android", "web"]).optional()
        .describe("Restrict to a single platform"),
      project_dir: z.string().optional().describe("Project directory (overrides JUI_PROJECT_DIR env)"),
    },
    async ({ platform, project_dir }) => {
      try {
        const projectDir = config.resolveProjectDir(project_dir);
        const args = ["ls", "api-models", "--json"];
        if (platform) {
          args.push("--platform", platform);
        }
        const result = await runCli("jui", args, { cwd: projectDir });
        if (result.exitCode !== 0) {
          return {
            content: [{
              type: "text",
              text: result.stderr || result.stdout || "jui ls api-models failed",
            }],
          };
        }
        return { content: [{ type: "text", text: result.stdout.trim() }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }] };
      }
    }
  );
}
