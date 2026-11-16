import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServerConfig } from "../../config.js";
import { runCli, formatResult } from "../../cli_runner.js";

export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "test_artifacts_status",
    "Show the resolved test-artifacts configuration (output dir, iOS xcresult discovery, Android appId) and list already-pulled artifact files",
    {
      project_dir: z.string().optional().describe("Project directory (overrides JUI_PROJECT_DIR env)"),
    },
    async (params) => {
      try {
        const projectDir = config.resolveProjectDir(params.project_dir);
        const result = await runCli("jsonui-test", ["artifacts", "status", "--json"], {
          cwd: projectDir,
        });
        if (result.exitCode === 0) {
          try {
            JSON.parse(result.stdout);
            // The CLI already emits a JSON document — pass it through verbatim.
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
