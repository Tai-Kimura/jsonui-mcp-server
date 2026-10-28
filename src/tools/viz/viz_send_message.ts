import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SESSION_SCOPE, runViz, vizResult } from "./viz_common.js";

const session = z.string().min(1).max(200).refine((s) => s.trim().length > 0, "session must not be blank");

export function register(server: McpServer) {
  server.tool(
    "viz_send_message",
    "Send one message to a connected local session across Claude Code, Codex and Codex local-model providers. " +
      "Call viz_peers first to select exact session ids. Both robots' Talk views keep the message. " +
      "Use a NEW message_id for a new message; reuse the SAME id and exact content when checking/retrying a request. " +
      "Never change the id to retry an unknown delivery. 'sent' means transport acceptance, not model read. " + SESSION_SCOPE,
    {
      recipient: session.describe("Recipient's exact session id from viz_peers; a unique name also works"),
      text: z.string().refine((s) => s.trim().length > 0 && Array.from(s).length <= 20_000,
        "text must contain 1 to 20000 characters").describe("Message body, at most 20000 Unicode characters"),
      message_id: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/).describe(
        "Caller-chosen unique id (8-100 ASCII letters/digits/_/-). Keep this id for retries, including after timeout"
      ),
      sender: session.optional().describe(
        "Sender session id. Omit to use CLI current-agent detection; specify when this MCP process cannot identify the session"
      ),
    },
    async (params) => {
      try {
        // Equals forms preserve leading dashes as data. execFile never invokes a shell.
        const args = ["message", `--to=${params.recipient}`, `--text=${params.text}`, `--id=${params.message_id}`];
        if (params.sender !== undefined) args.push(`--from=${params.sender}`);
        // The CLI's own HTTP timeout is 40 s, plus current-agent detection.
        const result = await runViz(args, 90_000);
        const response = JSON.parse(vizResult(result));
        if (response.result?.ok === false) response.success = false;
        response.message_id = params.message_id;
        return { isError: !response.success, content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
      } catch (e: any) {
        return { isError: true, content: [{ type: "text", text: JSON.stringify({ success: false,
          message_id: params.message_id, errors: e.message }) }] };
      }
    }
  );
}
