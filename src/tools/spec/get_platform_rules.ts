import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SpecLoader } from "../../spec_loader.js";

export function register(server: McpServer, loader: SpecLoader) {
  server.tool(
    "get_platform_rules",
    "Get platform-scoping rules for layouts: how to change an attribute on one platform only (node-level 'platform' object form, e.g. iOS-only fontColor), how to drop a node per platform (string form + language tokens), the layout-root 'platforms' whitelist, precedence, and how this differs from 'responsive'",
    {},
    async () => {
      const result = loader.getPlatformRules();
      if (!result) {
        return {
          content: [
            {
              type: "text",
              text: "platform_semantics.json not found — the connected jsonui-cli checkout predates it. Fall back to lookup_attribute('platform') for the short definition.",
            },
          ],
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
