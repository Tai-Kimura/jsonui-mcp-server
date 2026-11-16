import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServerConfig } from "../../config.js";
import { runCli, formatResult } from "../../cli_runner.js";

export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "test_generate_description",
    "Generate a description JSON file for a screen or flow test case via the jsonui-test CLI",
    {
      test_type: z.enum(["screen", "flow"]).describe("Whether the case belongs to a screen or flow test"),
      name: z.string().describe("Screen/flow name (e.g., login, checkout)"),
      case_name: z.string().describe("Test case name (e.g., initial_display, happy_path)"),
      path: z
        .string()
        .optional()
        .describe("Output file path (default: tests/<type>s/<name>/descriptions/<case_name>.json)"),
      project_dir: z.string().optional().describe("Project directory (overrides JUI_PROJECT_DIR env)"),
    },
    async (params) => {
      try {
        const projectDir = config.resolveProjectDir(params.project_dir);
        const args = ["generate", "description", params.test_type, params.name, params.case_name];
        if (params.path) { args.push("--path", params.path); }

        const result = await runCli("jsonui-test", args, { cwd: projectDir });
        return { content: [{ type: "text", text: formatResult(result) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }] };
      }
    }
  );
}
