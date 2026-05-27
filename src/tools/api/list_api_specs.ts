import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServerConfig } from "../../config.js";
import { runCli } from "../../cli_runner.js";

/**
 * Discovery wrapper around `jui ls api-specs --json`.
 *
 * Lists swagger / OpenAPI files under the project's `api_directory` with
 * lightweight parsed metadata (title, version, schema_count, enum_count,
 * endpoint_count) plus flags for v1-halt constructs (`has_one_of`,
 * `has_multi_file_ref`). Used by agents to decide whether the swagger is
 * ready for `jui build` or needs cleanup first.
 */
export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "list_api_specs",
    "List swagger / OpenAPI files under api_directory with parsed metadata (title, version, schema/enum/endpoint counts, halt-construct flags)",
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
