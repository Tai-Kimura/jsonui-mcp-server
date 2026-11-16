import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { join, relative } from "path";
import { ServerConfig } from "../../config.js";

const MAX_RESULTS = 30;
const SNIPPET_LEN = 200;

/** Recursively collect *.spec.json / *.component.json under dir. */
function collectSpecFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      collectSpecFiles(p, out);
    } else if (entry.endsWith(".spec.json") || entry.endsWith(".component.json")) {
      out.push(p);
    }
  }
  return out;
}

/**
 * Walk a parsed spec and report the JSON paths whose keys or string values
 * contain the query. One entry per path, with a short snippet.
 */
function findMatches(
  node: any,
  q: string,
  path: string,
  out: { path: string; snippet: string }[]
) {
  if (out.length >= MAX_RESULTS) return;
  if (typeof node === "string") {
    if (node.toLowerCase().includes(q)) {
      out.push({ path, snippet: node.slice(0, SNIPPET_LEN) });
    }
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => findMatches(v, q, `${path}[${i}]`, out));
    return;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      const childPath = path ? `${path}.${k}` : k;
      if (k.toLowerCase().includes(q)) {
        const snippet =
          typeof v === "string"
            ? v.slice(0, SNIPPET_LEN)
            : JSON.stringify(v)?.slice(0, SNIPPET_LEN) ?? "";
        out.push({ path: childPath, snippet });
        if (out.length >= MAX_RESULTS) return;
      }
      findMatches(v, q, childPath, out);
      if (out.length >= MAX_RESULTS) return;
    }
  }
}

export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "search_specs",
    "Keyword-search across ALL project spec files (screen specs, sub-specs in subdirectories, component specs). Returns file + JSON path + snippet per match — the fast way to find which spec (or which sub-spec of a split screen) covers a topic",
    {
      query: z.string().describe("Search keyword (matched case-insensitively against keys and string values)"),
      project_dir: z.string().optional().describe("Project directory (overrides JUI_PROJECT_DIR env)"),
    },
    async ({ query, project_dir }) => {
      try {
        const projectDir = config.resolveProjectDir(project_dir);
        const projectConfig = config.readProjectConfig(projectDir);
        const q = query.toLowerCase();
        if (!q.trim()) {
          return { content: [{ type: "text", text: "Empty query." }] };
        }

        const dirs = new Set<string>();
        for (const field of ["spec_directory", "component_spec_directory"] as const) {
          try {
            const d = config.resolveDir(projectConfig, field, projectDir);
            if (existsSync(d)) dirs.add(d);
          } catch {
            /* directory not configured */
          }
        }
        if (dirs.size === 0) {
          return { content: [{ type: "text", text: "No spec directories found." }] };
        }

        const results: any[] = [];
        for (const dir of dirs) {
          for (const filePath of collectSpecFiles(dir)) {
            if (results.length >= MAX_RESULTS) break;
            let matches: { path: string; snippet: string }[] = [];
            try {
              const data = JSON.parse(readFileSync(filePath, "utf-8"));
              findMatches(data, q, "", matches);
            } catch {
              continue;
            }
            if (matches.length > 0) {
              results.push({
                file: relative(dir, filePath),
                matchCount: matches.length,
                matches: matches.slice(0, 5),
              });
            }
          }
        }

        if (results.length === 0) {
          return { content: [{ type: "text", text: `No matches for '${query}'.` }] };
        }
        results.sort((a, b) => b.matchCount - a.matchCount);
        return {
          content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }] };
      }
    }
  );
}
