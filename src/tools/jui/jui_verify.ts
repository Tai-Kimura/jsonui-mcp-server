import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServerConfig } from "../../config.js";
import { runCli } from "../../cli_runner.js";

export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "jui_verify",
    "Compare generated Layout JSON against on-disk layouts and report differences",
    {
      spec_file: z.string().optional().describe("Single spec file to verify (e.g., 'login.spec.json')"),
      detail: z.boolean().optional().describe("Include per-screen diff details in report"),
      fail_on_diff: z.boolean().optional().describe("Exit with error if any diff detected"),
      platform: z.string().optional().describe("Target platform (defaults to first in config)"),
      project_dir: z.string().optional().describe("Project directory (overrides JUI_PROJECT_DIR env)"),
    },
    async (params) => {
      try {
        const projectDir = config.resolveProjectDir(params.project_dir);
        const args = ["verify"];
        if (params.spec_file) { args.push("--file", params.spec_file); }
        if (params.detail) { args.push("--detail"); }
        if (params.fail_on_diff) { args.push("--fail-on-diff"); }
        if (params.platform) { args.push("--platform", params.platform); }

        const result = await runCli("jui", args, { cwd: projectDir });
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: result.exitCode === 0,
              has_diffs: result.exitCode !== 0,
              report: result.stdout,
              errors: result.stderr || undefined,
            }, null, 2),
          }],
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }] };
      }
    }
  );
}
