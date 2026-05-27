import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServerConfig } from "../../config.js";
import { runCli } from "../../cli_runner.js";

/**
 * Discovery wrapper around `jui g api --dry-run --json`.
 *
 * Returns the schema filter result + the file list that *would* be written
 * for each platform, without touching disk. Agents call this after a
 * filter config change to confirm which schemas survive before running
 * `jui build` (which would actually emit + orphan-prune).
 */
export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "preview_api_model_sync",
    "Preview swagger → DTO + Domain generation without writing files. Returns kept_schemas / filtered_out / skip_domain_matches and the per-platform file list that would be emitted.",
    {
      platform: z.enum(["ios", "android", "web"]).optional()
        .describe("Restrict to a single platform"),
      project_dir: z.string().optional().describe("Project directory (overrides JUI_PROJECT_DIR env)"),
    },
    async ({ platform, project_dir }) => {
      try {
        const projectDir = config.resolveProjectDir(project_dir);
        const args = ["g", "api", "--dry-run", "--json"];
        if (platform) {
          args.push("--platform", platform);
        }
        const result = await runCli("jui", args, { cwd: projectDir });
        // Non-zero exit may indicate a swagger halt (oneOf, multi-file ref,
        // etc.). The CLI still emits structured JSON on the error path, so
        // pass stdout through when present.
        const body = result.stdout.trim() || result.stderr.trim();
        return { content: [{ type: "text", text: body || "preview returned no output" }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }] };
      }
    }
  );
}
