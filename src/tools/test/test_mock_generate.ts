import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServerConfig } from "../../config.js";
import { runCli, formatResult } from "../../cli_runner.js";

export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "test_mock_generate",
    "Manage API mock files against an OpenAPI/Swagger spec via the jsonui-test CLI. Writes ONLY into <mockDir>/generated/, which it wipes and rewrites on each run — anything outside that directory is hand-written and never touched. Mocks are matched to operations by their source method+path, not by filename, so a project's own naming keeps working. check=true reports drift (response bodies are compared against the schema: types, required, enum) without writing. Findings under generated/ are warnings, findings outside it are errors, and a scenario that merely omits OPTIONAL fields is a note that does not fail — omitting an optional field is a valid instance, and failing on it buries the real violations (set strict=true to demand full coverage). Do NOT fill optional fields in to silence a note: a mechanical merge puts null into non-nullable slots and manufactures violations. update_default=true rewrites each existing mock's default body + source route from the swagger while leaving every other scenario byte for byte. The 'mock serve' subcommand is intentionally NOT exposed over MCP (it is a long-running local HTTP server that executes run-targets).",
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
        .describe("When true, report drift vs swagger and do NOT write (adds --check). Default false = regenerate <mockDir>/generated/."),
      strict: z
        .boolean()
        .optional()
        .default(false)
        .describe("With check=true, treat a missing OPTIONAL field as drift too (adds --strict). Off by default."),
      update_default: z
        .boolean()
        .optional()
        .default(false)
        .describe("Rewrite each existing mock's default body + source route from the swagger, keeping every other scenario untouched (adds --update-default). Use this to clear body drift the check reported in hand-written mocks."),
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
        if (params.strict) { args.push("--strict"); }
        if (params.update_default) { args.push("--update-default"); }

        const result = await runCli("jsonui-test", args, { cwd: projectDir });
        return { content: [{ type: "text", text: formatResult(result) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }] };
      }
    }
  );
}
