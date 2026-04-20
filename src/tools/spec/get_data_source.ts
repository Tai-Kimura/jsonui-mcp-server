import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SpecLoader } from "../../spec_loader.js";

export function register(server: McpServer, loader: SpecLoader) {
  server.tool(
    "get_data_source",
    "Report where the MCP server loaded its component / attribute data from (env / cwd / home / bundled), the file's mtime, and a freshness bucket. Use this to confirm the attribute definitions are current after editing jsonui-cli.",
    {},
    async () => {
      const info = loader.getDataSource();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                ...info,
                hint:
                  info.freshness === "stale"
                    ? "Data is > 90 days old. Re-fetch via `npm rebuild jsonui-mcp-server` or point JSONUI_CLI_PATH at a fresher checkout."
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
