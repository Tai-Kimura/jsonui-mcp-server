import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SESSION_SCOPE, runViz, vizResult } from "./viz_common.js";

export function register(server: McpServer) {
  server.tool(
    "viz_stop",
    "Stop the jui viz server (the local viewer of Claude Code and Codex sessions). Only the server jui recorded is stopped. " +
      SESSION_SCOPE,
    {},
    async () => {
      try {
        const result = await runViz(["stop"], 30_000);
        return { content: [{ type: "text", text: vizResult(result) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }] };
      }
    }
  );
}
