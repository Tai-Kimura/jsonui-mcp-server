import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SpecLoader } from "../../spec_loader.js";

export function register(server: McpServer, loader: SpecLoader) {
  server.tool(
    "get_data_source",
    "Report where the MCP server loaded its component / attribute data from — separately for attribute_definitions.json (raw schema) and component_metadata.json (presentation metadata). Shows layer (env / cwd / home / bundled), file mtime, and freshness bucket per file. Use this to confirm the data is current after editing jsonui-cli.",
    {},
    async () => {
      const info = loader.getDataSource();
      const stale =
        info.attributeDefinitions.freshness === "stale" ||
        info.componentMetadata.freshness === "stale";
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                attributeDefinitions: info.attributeDefinitions,
                componentMetadata: info.componentMetadata,
                componentCount: info.componentCount,
                commonAttributeCount: info.commonAttributeCount,
                hint: stale
                  ? "At least one data file is > 90 days old. Re-fetch via `npm rebuild jui-tools-mcp-server` or point JSONUI_CLI_PATH at a fresher checkout."
                  : undefined,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
