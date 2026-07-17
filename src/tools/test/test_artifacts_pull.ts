import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServerConfig } from "../../config.js";
import { runCli, formatResult } from "../../cli_runner.js";

export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "test_artifacts_pull",
    "Pull test artifacts (screenshots/recordings) from the latest run (iOS xcresult / Android device / web Playwright output) into the project's configured artifacts directory, returning generated file paths",
    {
      project_dir: z.string().optional().describe("Project directory (overrides JUI_PROJECT_DIR env)"),
      platform: z.enum(["ios", "android", "web", "all"]).optional().describe("Restrict pulling to one platform (default: all configured)"),
      xcresult: z.string().optional().describe("Explicit .xcresult bundle path (iOS)"),
      serial: z.string().optional().describe("adb device serial (Android)"),
      clean: z.boolean().optional().describe("Remove artifacts from the device after pulling (Android)"),
    },
    async (params) => {
      try {
        const projectDir = config.resolveProjectDir(params.project_dir);
        const args = ["artifacts", "pull", "--json"];
        if (params.platform) { args.push("--platform", params.platform); }
        if (params.xcresult) { args.push("--xcresult", params.xcresult); }
        if (params.serial) { args.push("--serial", params.serial); }
        if (params.clean) { args.push("--clean"); }

        // xcresult export can exceed the default 60s timeout.
        const result = await runCli("jsonui-test", args, {
          cwd: projectDir,
          timeout: 180_000,
        });
        if (result.exitCode === 0) {
          try {
            JSON.parse(result.stdout);
            // The CLI already emits a JSON document ({outputDir, files, skipped})
            // — pass it through verbatim so callers don't peel a wrapper envelope.
            return { content: [{ type: "text", text: result.stdout.trim() }] };
          } catch {
            // Not JSON — fall through to the standard envelope.
          }
        }
        return { content: [{ type: "text", text: formatResult(result) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }] };
      }
    }
  );
}
