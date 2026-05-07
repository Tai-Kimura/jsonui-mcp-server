import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SpecLoader } from "../../spec_loader.js";

export function register(server: McpServer, loader: SpecLoader) {
  server.tool(
    "search_components",
    "Search components and attributes by keyword (e.g. 'binding', 'focus', 'color')",
    { query: z.string().describe("Search keyword") },
    async ({ query }) => {
      const results = loader.searchComponents(query);
      if (results.length === 0) {
        return {
          content: [{ type: "text", text: `No results for '${query}'.` }],
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(results.slice(0, 20), null, 2) }],
      };
    }
  );
}
