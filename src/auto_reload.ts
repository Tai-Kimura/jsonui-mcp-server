import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SpecLoader } from "./spec_loader.js";

/**
 * Make every tool registered on `server` refresh the canon before it runs.
 *
 * Installed ONCE, before any `register(...)` call, by wrapping `server.tool`:
 * the last function argument of each registration is the handler, and it is
 * replaced with one that calls `loader.refreshIfChanged()` first. One wrap,
 * 41 tools, no per-tool code — which is the point: a per-tool call is the
 * kind of thing the 42nd tool forgets.
 *
 * ⚠️ Groups B–F read `ServerConfig`, not the loader, and are wrapped anyway.
 * The cost is ~0.2 ms per call; the alternative is a list of "tools that need
 * it" that drifts from the list of tools that read the canon.
 */
export function installAutoReload(server: McpServer, loader: SpecLoader): void {
  const original = (server.tool as (...args: unknown[]) => unknown).bind(server);
  (server as unknown as { tool: (...args: unknown[]) => unknown }).tool = (
    ...args: unknown[]
  ) => {
    let index = -1;
    for (let i = args.length - 1; i >= 0; i--) {
      if (typeof args[i] === "function") {
        index = i;
        break;
      }
    }
    if (index >= 0) {
      const handler = args[index] as (...handlerArgs: unknown[]) => unknown;
      args[index] = async (...handlerArgs: unknown[]) => {
        loader.refreshIfChanged();
        return handler(...handlerArgs);
      };
    }
    return original(...args);
  };
}
