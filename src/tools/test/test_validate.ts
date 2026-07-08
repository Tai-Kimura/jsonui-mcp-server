import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServerConfig } from "../../config.js";
import { runCli, formatResult } from "../../cli_runner.js";

export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "test_validate",
    "Validate JsonUI test files (screen/flow tests + descriptions) against the schema via the jsonui-test CLI",
    {
      files: z
        .array(z.string())
        .min(1)
        .describe("Files or directories to validate (e.g., ['tests/screens'] or ['login.test.json'])"),
      verbose: z.boolean().optional().describe("Show all files, including valid ones"),
      quiet: z.boolean().optional().describe("Hide warnings, show only errors"),
      project_dir: z.string().optional().describe("Project directory (overrides JUI_PROJECT_DIR env)"),
    },
    async (params) => {
      try {
        const projectDir = config.resolveProjectDir(params.project_dir);
        const args = ["validate", ...params.files];
        if (params.verbose) { args.push("--verbose"); }
        if (params.quiet) { args.push("--quiet"); }

        const result = await runCli("jsonui-test", args, { cwd: projectDir });
        return { content: [{ type: "text", text: formatResult(result) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }] };
      }
    }
  );
}
