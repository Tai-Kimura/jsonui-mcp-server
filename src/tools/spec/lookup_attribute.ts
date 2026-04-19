import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SpecLoader } from "../../spec_loader.js";

export function register(server: McpServer, loader: SpecLoader) {
  server.tool(
    "lookup_attribute",
    "Look up a specific attribute definition, its type, binding support, and which components use it",
    { name: z.string().describe("Attribute name (e.g. 'fontSize', 'padding', 'onClick')") },
    async ({ name }) => {
      const result = loader.getAttribute(name);
      if (!result) {
        return {
          content: [{ type: "text", text: `Attribute '${name}' not found.` }],
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
