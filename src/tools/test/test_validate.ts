import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServerConfig } from "../../config.js";
import { runCli, formatResult } from "../../cli_runner.js";

export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "test_validate",
    "Validate JsonUI test files (screen/flow tests + descriptions) against the schema via the jsonui-test CLI. When the project config declares mock.swagger + mock.mockDir this ALSO regenerates <mockDir>/generated/ if it is missing or older than the swagger, and fails on mock contract drift — so a non-zero result here is not necessarily about the test files. A mock that merely omits optional fields does not fail this gate (set mock.checkOptionalFields=true in the project config to demand full coverage). Pass no_mock_check to validate the test files alone.",
    {
      files: z
        .array(z.string())
        .min(1)
        .describe("Files or directories to validate (e.g., ['tests/screens'] or ['login.test.json'])"),
      verbose: z.boolean().optional().describe("Show all files, including valid ones"),
      quiet: z.boolean().optional().describe("Hide warnings, show only errors"),
      no_mock_check: z
        .boolean()
        .optional()
        .describe("Skip the mock-vs-swagger contract check that otherwise runs on the same gate"),
      project_dir: z.string().optional().describe("Project directory (overrides JUI_PROJECT_DIR env)"),
    },
    async (params) => {
      try {
        const projectDir = config.resolveProjectDir(params.project_dir);
        const args = ["validate", ...params.files];
        if (params.verbose) { args.push("--verbose"); }
        if (params.quiet) { args.push("--quiet"); }
        if (params.no_mock_check) { args.push("--no-mock-check"); }

        const result = await runCli("jsonui-test", args, { cwd: projectDir });
        return { content: [{ type: "text", text: formatResult(result) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }] };
      }
    }
  );
}
