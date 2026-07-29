import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServerConfig } from "../../config.js";
import { runCli, formatResult } from "../../cli_runner.js";

export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "test_mock_generate",
    "Manage API mock files against an OpenAPI/Swagger spec via the jsonui-test CLI. Writes ONLY into <mockDir>/generated/, which it wipes and rewrites on each run — anything outside that directory is hand-written and never touched. Mocks are matched to operations by their source method+path, not by filename, so a project's own naming keeps working. Only the endpoints the project declares it consumes are scaffolded and checked: api.schemas.include_paths / exclude_paths (the same keys the DTO codegen filters on), or mock.includePaths / mock.excludePaths when the mock scope differs. A shared swagger's other realms are therefore NOT reported as mocks this project is missing — if a check reports many [MISSING] entries, read the paths before writing any, because endpoints from a realm the app cannot reach mean the scope is undeclared and the fix is one config key. A mock file serving an out-of-scope route is reported as [SCOPE] (an unused file, safe to delete) and does not fail; [ORPHAN] still means the swagger has no such endpoint at all, and still fails. check=true reports drift (response bodies are compared against the schema: types, required, enum) without writing. Findings under generated/ are warnings, findings outside it are errors, and a scenario that merely omits OPTIONAL fields is a note that does not fail — omitting an optional field is a valid instance, and failing on it buries the real violations (set strict=true to demand full coverage). Do NOT fill optional fields in to silence a note: a mechanical merge puts null into non-nullable slots and manufactures violations. update_default=true REPAIRS each existing mock's default scenario: it adds the required fields the contract has and the body lacks, refreshes the source route, and changes nothing else — no existing value is overwritten, nothing is removed, other scenarios are untouched. The default scenario is where a project keeps the data its tests assert on (scaffolding creates default and nothing else), so never replace a body wholesale to satisfy the check. Violations a merge cannot decide — wrong type, undeclared field — are reported for a person. dry_run=true previews. The 'mock serve' subcommand is intentionally NOT exposed over MCP (it is a long-running local HTTP server that executes run-targets).",
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
        .describe("Repair each existing mock's default scenario by ADDING missing required fields (adds --update-default). Never overwrites a value or removes a field."),
      dry_run: z
        .boolean()
        .optional()
        .default(false)
        .describe("With update_default, report what would be added without writing (adds --dry-run)."),
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
        if (params.dry_run) { args.push("--dry-run"); }

        const result = await runCli("jsonui-test", args, { cwd: projectDir });
        return { content: [{ type: "text", text: formatResult(result) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }] };
      }
    }
  );
}
