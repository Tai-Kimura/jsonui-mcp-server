import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SpecLoader } from "../../spec_loader.js";

export function register(server: McpServer, loader: SpecLoader) {
  server.tool(
    "get_modifier_order",
    "Get modifier application order for a platform (critical for correct rendering)",
    {
      platform: z
        .enum(["swift", "kotlin", "react"])
        .optional()
        .describe("Platform (omit for all platforms)"),
    },
    async ({ platform }) => {
      const result = loader.getModifierOrder(platform);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
