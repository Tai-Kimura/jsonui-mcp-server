import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SpecLoader } from "../../spec_loader.js";

export function register(server: McpServer, loader: SpecLoader) {
  server.tool(
    "get_screen_identity",
    "Get the canonical screen-identity rules: what counts as a screen, how a screen id is derived, " +
      "the runtime marker, the per-platform 'is this screen displayed' predicates, and the " +
      "assert:\"screen\" vocabulary. Use before writing screen/flow tests or navigation code.",
    {},
    async () => {
      const result = loader.getScreenIdentity();
      if (!result) {
        return {
          content: [
            {
              type: "text",
              text:
                "screen_identity.json is not available in this installation. " +
                "Update the MCP server (npm run fetch-definitions) or point it at a " +
                "jsonui-cli checkout that has shared/core/screen_identity.json.",
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
