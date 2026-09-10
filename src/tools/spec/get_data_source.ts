import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SpecLoader } from "../../spec_loader.js";

export function register(server: McpServer, loader: SpecLoader) {
  server.tool(
    "get_data_source",
    "Report where the MCP server loaded EVERY canonical data file from — attribute_definitions.json (raw schema), component_metadata.json (presentation metadata), screen_identity.json and binding_semantics.json. Shows layer (env / cwd / home / bundled), the absolute path actually read, file mtime and freshness per file, plus when this server process loaded them. Use it when the CLI and the MCP seem to disagree about the canon: since 2.12.0 every tool call re-reads a file whose CONTENT changed (sha256, not mtime), so a restart is not needed after a jsonui-cli distribution; `lastReload` says when that last happened and whether it succeeded, and `staleInMemory` is non-empty only when a reload FAILED (a file did not parse) and the server is still serving the previous content.",
    {},
    async () => {
      const info = loader.getDataSource();
      // 🚨 THE SAME SEVEN THE STALENESS CHECK WATCHES. This list held five
      // while `getChangedSinceLoad` tracked seven, so `staleInMemory` could
      // name a path that appeared in no per-file entry — and a reader who
      // "checked every file reported" had two outside their view. Reported by
      // a consumer lane 2026-09-09. Aligning the two beats documenting the
      // difference: a documented difference asks the reader to count.
      const files = [
        info.attributeDefinitions,
        info.componentMetadata,
        info.screenIdentity,
        info.bindingSemantics,
        info.attributeSemantics,
        info.platformSemantics,
        info.coverage,
      ].filter((f): f is NonNullable<typeof f> => f != null);
      const stale = files.some((f) => f.freshness === "stale");
      // The data is read once at construction and cached in memory, so a
      // file edited after this timestamp is NOT what the server is serving,
      // however current the file on disk looks.
      const loadedAt = loader.getLoadedAt();
      const changedSinceLoad = loader.getChangedSinceLoad();
      const lastReload = loader.getLastReload() ?? undefined;
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
                attributeSemantics: info.attributeSemantics,
                platformSemantics: info.platformSemantics,
                coverage: info.coverage,
                componentCount: info.componentCount,
                commonAttributeCount: info.commonAttributeCount,
                loadedAt,
                lastReload,
                staleInMemory: changedSinceLoad.length > 0 ? changedSinceLoad : undefined,
                //  `freshness` is a property of the FILE (how old it is);
                //  `staleInMemory` is a property of THIS SERVER (whether what
                //  it holds still matches disk). They are different
                //  quantities, and a reader who checks only the first gets
                //  "fresh" on every file while the server serves something
                //  else. The hint names which one fired.
                hint: changedSinceLoad.length
                  ? "The CONTENT of these files differs from what this server loaded (compared by sha256, not by timestamp — a distribution moves every mtime without changing bytes) AND the automatic reload did not replace it — see lastReload.error. The server keeps serving the last content that parsed; fix the file (or wait for the distribution to finish writing it) and call again."
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
