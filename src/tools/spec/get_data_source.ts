import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SpecLoader } from "../../spec_loader.js";

export function register(server: McpServer, loader: SpecLoader) {
  server.tool(
    "get_data_source",
    "Report where the MCP server loaded EVERY canonical data file from — attribute_definitions.json (raw schema), component_metadata.json (presentation metadata), screen_identity.json and binding_semantics.json. Shows layer (env / cwd / home / bundled), the absolute path actually read, file mtime and freshness per file, plus when this server process loaded them. Use it when the CLI and the MCP seem to disagree about the canon: it distinguishes a stale file from a server that simply has not been restarted since the file changed.",
    {},
    async () => {
      const info = loader.getDataSource();
      const files = [
        info.attributeDefinitions,
        info.componentMetadata,
        info.screenIdentity,
        info.bindingSemantics,
      ].filter((f): f is NonNullable<typeof f> => f != null);
      const stale = files.some((f) => f.freshness === "stale");
      // The data is read once at construction and cached in memory, so a
      // file edited after this timestamp is NOT what the server is serving,
      // however current the file on disk looks.
      const loadedAt = loader.getLoadedAt();
      const changedSinceLoad = files
        .filter((f) => new Date(f.lastModified) > new Date(loadedAt))
        .map((f) => f.path);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                attributeDefinitions: info.attributeDefinitions,
                componentMetadata: info.componentMetadata,
                screenIdentity: info.screenIdentity,
                bindingSemantics: info.bindingSemantics,
                componentCount: info.componentCount,
                commonAttributeCount: info.commonAttributeCount,
                loadedAt,
                staleInMemory: changedSinceLoad.length > 0 ? changedSinceLoad : undefined,
                hint: changedSinceLoad.length
                  ? "These files changed on disk AFTER this server loaded them. The server is serving the older content from memory — restart it."
                  : stale
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
