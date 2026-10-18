import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CLAUDE_CODE_ONLY, runViz, vizResult } from "./viz_common.js";

export function register(server: McpServer) {
  server.tool(
    "viz_stop",
    "Stop the jui viz server (the local viewer of Claude Code sessions). Only the server jui recorded is stopped. " +
      CLAUDE_CODE_ONLY,
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
