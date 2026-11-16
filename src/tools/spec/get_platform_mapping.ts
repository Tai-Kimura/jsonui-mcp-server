import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SpecLoader } from "../../spec_loader.js";

export function register(server: McpServer, loader: SpecLoader) {
  server.tool(
    "get_platform_mapping",
    "Get cross-platform attribute value conversion mapping (e.g. matchParent, textAlign, fontWeight)",
    {
      category: z
        .string()
        .optional()
        .describe("Mapping category (values, contentMode, textAlign, fontWeight, orientation, gravity, types). Omit for all."),
    },
    async ({ category }) => {
      const result = loader.getPlatformMapping(category);
      if (!result) {
        const categories = Object.keys(loader.getPlatformMapping()).join(", ");
        return {
          content: [{ type: "text", text: `Category '${category}' not found. Available: ${categories}` }],
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
