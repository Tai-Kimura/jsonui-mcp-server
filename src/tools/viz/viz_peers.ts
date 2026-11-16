import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SESSION_SCOPE, runViz, vizResult } from "./viz_common.js";

export function register(server: McpServer) {
  server.tool(
    "viz_peers",
    "List live local sessions for messaging: session id, name, CLI, model, provider and availability. " +
      "Use an exact id as recipient/sender in viz_send_message. Does not send any message. " + SESSION_SCOPE,
    {},
    async () => {
      try {
        const result = await runViz(["peers"], 30_000);
        return { isError: result.exitCode !== 0, content: [{ type: "text", text: vizResult(result) }] };
      } catch (e: any) {
        return { isError: true, content: [{ type: "text", text: `Error: ${e.message}` }] };
      }
    }
  );
}
