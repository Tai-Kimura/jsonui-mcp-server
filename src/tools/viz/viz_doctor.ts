import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CLAUDE_CODE_ONLY, runViz, vizResult } from "./viz_common.js";

export function register(server: McpServer) {
  server.tool(
    "viz_doctor",
    "Check the environment for jui viz (the local viewer of Claude Code sessions): Python packages, the hooks and " +
      "the Python they run, the port, the claude CLI. Each check has name, ok and detail. " +
      CLAUDE_CODE_ONLY,
    {},
    async () => {
      try {
        const result = await runViz(["doctor", "--json"], 30_000);
        return { content: [{ type: "text", text: vizResult(result) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }] };
      }
    }
  );
}
