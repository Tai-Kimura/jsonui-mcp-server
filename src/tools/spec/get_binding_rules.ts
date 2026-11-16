import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SpecLoader } from "../../spec_loader.js";

export function register(server: McpServer, loader: SpecLoader) {
  server.tool(
    "get_binding_rules",
    "Get binding syntax rules: two-way vs read-only, platform-specific formats, critical rules",
    {},
    async () => {
      const result = loader.getBindingRules();
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
