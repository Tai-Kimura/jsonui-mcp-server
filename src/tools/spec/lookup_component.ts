import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SpecLoader } from "../../spec_loader.js";

export function register(server: McpServer, loader: SpecLoader) {
  server.tool(
    "lookup_component",
    "Look up a JsonUI component specification including attributes, binding behavior, platform-specific details, and rules",
    { name: z.string().describe("Component name (e.g. 'TextField', 'Button', 'View')") },
    async ({ name }) => {
      const spec = loader.getComponentWithCommon(name);
      if (!spec) {
        const available = loader.listComponents().join(", ");
        return {
          content: [{ type: "text", text: `Component '${name}' not found. Available: ${available}` }],
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(spec, null, 2) }],
      };
    }
  );
}
