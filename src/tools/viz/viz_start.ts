import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SESSION_SCOPE, runViz, vizResult } from "./viz_common.js";

export function register(server: McpServer) {
  server.tool(
    "viz_start",
    "Start the jui viz server (the local viewer of Claude Code and Codex sessions) in the background and return its URL " +
      "on 127.0.0.1. A server already running is reported (alreadyRunning), not started again. Hooks and the " +
      "relay are installed with the jui CLI, not here. " +
      SESSION_SCOPE,
    {
      port: z.number().int().min(1).max(65535).optional().describe("Port on 127.0.0.1 (default: the viz config, 7788)"),
    },
    async (params) => {
      try {
        const args = ["start", "--json"];
        if (params.port !== undefined) { args.push("--port", String(params.port)); }
        // jui waits up to 15 s for the server to answer.
        const result = await runViz(args, 45_000);
        return { content: [{ type: "text", text: vizResult(result) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }] };
      }
    }
  );
}
