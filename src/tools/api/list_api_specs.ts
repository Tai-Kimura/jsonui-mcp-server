import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServerConfig } from "../../config.js";
import { runCli } from "../../cli_runner.js";

/**
 * Discovery wrapper around `jui ls api-specs --json`.
 *
 * Lists swagger / OpenAPI files under the project's `api_directory` with
 * lightweight parsed metadata (title, version, schema_count, enum_count,
 * endpoint_count) plus advisory flags for polymorphism / multi-file ref
 * usage (`has_one_of`, `has_multi_file_ref`).
 *
 * Note: `has_one_of: true` is **not** equivalent to "will halt". Field-level
 * `oneOf` paired with `discriminator` + explicit `mapping` (variants `$ref`
 * top-level schemas + sibling discriminator property present) is supported
 * and emits Swift enum / Kotlin sealed class / TS discriminated union code.
 * Other shapes (anyOf, schema-level oneOf, oneOf without discriminator,
 * discriminator alone) still halt. Agents should verify each `oneOf` site
 * rather than blanket-flagging the file as broken.
 */
export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "list_api_specs",
    "List swagger / OpenAPI files under api_directory with parsed metadata (title, version, schema/enum/endpoint counts, advisory polymorphism flags — see has_one_of caveat in tool doc)",
    {
      project_dir: z.string().optional().describe("Project directory (overrides JUI_PROJECT_DIR env)"),
    },
    async ({ project_dir }) => {
      try {
        const projectDir = config.resolveProjectDir(project_dir);
        const result = await runCli(
          "jui",
          ["ls", "api-specs", "--json"],
          { cwd: projectDir }
        );
        if (result.exitCode !== 0) {
          return {
            content: [{
              type: "text",
              text: result.stderr || result.stdout || "jui ls api-specs failed",
            }],
          };
        }
        // The CLI already emits a JSON document — pass it through verbatim
        // so callers don't have to peel a wrapper envelope.
        return { content: [{ type: "text", text: result.stdout.trim() }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }] };
      }
    }
  );
}
