import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServerConfig } from "../../config.js";
import { runCli, formatResult } from "../../cli_runner.js";

export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "test_mock_generate",
    "Scaffold API mock files from OpenAPI/Swagger via the jsonui-test CLI. With check=true, report drift vs the swagger without writing (does not scaffold). The 'mock serve' subcommand is intentionally NOT exposed over MCP (it is a long-running local HTTP server that executes run-targets).",
    {
      swagger: z
        .array(z.string())
        .optional()
        .describe("Paths to OpenAPI files (repeatable). Defaults to the project mock config if omitted."),
      out: z.string().optional().describe("Output mock dir (default: mock.mockDir or tests/mocks)"),
      config_file: z.string().optional().describe("Config file (default: jui.config.json)"),
      check: z
        .boolean()
        .optional()
        .default(false)
        .describe("When true, report drift vs swagger and do NOT write (adds --check). Default false = write/scaffold."),
      project_dir: z.string().optional().describe("Project directory (overrides JUI_PROJECT_DIR env)"),
    },
    async (params) => {
      try {
        const projectDir = config.resolveProjectDir(params.project_dir);
        const args = ["mock", "generate"];
        for (const s of params.swagger ?? []) { args.push("--swagger", s); }
        if (params.out) { args.push("--out", params.out); }
        if (params.config_file) { args.push("--config", params.config_file); }
        if (params.check) { args.push("--check"); }

        const result = await runCli("jsonui-test", args, { cwd: projectDir });
        return { content: [{ type: "text", text: formatResult(result) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }] };
      }
    }
  );
}
