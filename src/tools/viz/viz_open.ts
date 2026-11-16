import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SESSION_SCOPE, runViz, vizResult } from "./viz_common.js";

export function register(server: McpServer) {
  server.tool(
    "viz_open",
    "Open the running jui viz page (the local viewer of Claude Code and Codex sessions) in the user's browser. " +
      "Fails when no server runs: call viz_start first. " +
      SESSION_SCOPE,
    {},
    async () => {
      try {
        const result = await runViz(["open"], 30_000);
        return { content: [{ type: "text", text: vizResult(result) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }] };
      }
    }
  );
}
