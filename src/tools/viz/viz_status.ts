import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SESSION_SCOPE, runViz, vizResult } from "./viz_common.js";

export function register(server: McpServer) {
  server.tool(
    "viz_status",
    "Report jui viz (the local viewer of Claude Code and Codex sessions): whether its server runs (pid, URL), the hooks in " +
      "~/.claude/settings.json (installed of 18), and whether the permission relay is registered. " +
      SESSION_SCOPE,
    {
      relay: z.boolean().optional().describe(
        "Also ask claude whether the permission relay is registered (default true; runs `claude mcp get`, a few seconds)"
      ),
    },
    async (params) => {
      try {
        const args = ["status", "--json"];
        if (params.relay !== false) { args.push("--with-relay"); }
        const result = await runViz(args, 30_000);
        return { content: [{ type: "text", text: vizResult(result) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }] };
      }
    }
  );
}
