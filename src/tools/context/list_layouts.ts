import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readdirSync, existsSync } from "fs";
import { join } from "path";
import { ServerConfig } from "../../config.js";
import { runCli } from "../../cli_runner.js";

/**
 * Screen classification for the listed layouts, obtained from `jui screens
 * --json` rather than reimplemented here.
 *
 * Classification depends on how OTHER layouts reference this one, and the
 * rules live in shared/core/screen_identity.json with one Python reader and
 * one Ruby reader already held to each other by a cross-language test. A
 * third reader in TypeScript would be a third thing to keep in sync, so this
 * asks the CLI. When the CLI is unavailable or predates `jui screens`, the
 * listing simply comes back without classification instead of guessing.
 */
async function classifyScreens(
  projectDir: string
): Promise<Map<string, { role: string; reason: string; marker: string | null }> | null> {
  const result = await runCli("jui", ["screens", "--json"], { cwd: projectDir, timeout: 30_000 });
  if (!result.stdout.trim()) return null;
  try {
    const payload = JSON.parse(result.stdout);
    const byId = new Map<string, { role: string; reason: string; marker: string | null }>();
    for (const entry of payload.entries ?? []) {
      byId.set(entry.screen, {
        role: entry.role,
        reason: entry.reason,
        marker: entry.marker ?? null,
      });
    }
    return byId;
  } catch {
    return null;
  }
}

export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "list_layouts",
    "List all Layout JSON files in the shared layouts directory",
    {
      project_dir: z.string().optional().describe("Project directory (overrides JUI_PROJECT_DIR env)"),
    },
    async ({ project_dir }) => {
      try {
        const projectDir = config.resolveProjectDir(project_dir);
        const projectConfig = config.readProjectConfig(projectDir);
        const layoutsDir = config.resolveDir(projectConfig, "layouts_directory", projectDir);

        if (!existsSync(layoutsDir)) {
          return { content: [{ type: "text", text: `Layouts directory not found: ${layoutsDir}` }] };
        }

        const collectJsonFiles = (dir: string, prefix: string = ""): string[] => {
          const entries = readdirSync(dir, { withFileTypes: true });
          const files: string[] = [];
          for (const entry of entries) {
            const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
            if (entry.isDirectory()) {
              files.push(...collectJsonFiles(join(dir, entry.name), relPath));
            } else if (entry.name.endsWith(".json")) {
              files.push(relPath);
            }
          }
          return files;
        };

        const files = collectJsonFiles(layoutsDir);

        // Responsive variant files (home@regular.json) are attached to
        // their base screen instead of listed as standalone layouts —
        // they replace the base's whole tree per size-class tier and
        // never have their own spec/VM/Data.
        const isVariant = (relPath: string): boolean => {
          const basename = relPath.split("/").pop() ?? relPath;
          return basename.includes("@");
        };
        const baseOf = (relPath: string): string => {
          const idx = relPath.lastIndexOf("@");
          return idx > 0 ? `${relPath.slice(0, idx)}.json` : relPath;
        };

        const bases = files.filter((f) => !isVariant(f));
        const variantsByBase = new Map<string, string[]>();
        for (const f of files) {
          if (!isVariant(f)) continue;
          const base = baseOf(f.replace(/\.json$/, ""));
          const list = variantsByBase.get(base) ?? [];
          list.push(f);
          variantsByBase.set(base, list);
        }

        // Screen id = layout basename (variant-normalized); the role tells
        // callers which layouts may legitimately appear as a test's `screen`
        // and which are cells/partials that render inside a host.
        const classification = await classifyScreens(projectDir);
        const screenIdOf = (relPath: string): string => {
          const basename = relPath.split("/").pop() ?? relPath;
          return basename.replace(/\.json$/, "").split("@")[0];
        };

        const listing = bases.map((f) => {
          const variants = variantsByBase.get(f);
          const info = classification?.get(screenIdOf(f));
          if (!info && !variants) return f;
          return {
            layout: f,
            ...(variants ? { variants: variants.sort() } : {}),
            ...(info
              ? { screen: screenIdOf(f), role: info.role, roleReason: info.reason }
              : {}),
          };
        });
        // Orphan variants (base missing) still surface — flagged so the
        // caller can report them instead of silently dropping files.
        for (const [base, variants] of variantsByBase) {
          if (!bases.includes(base)) {
            listing.push({ layout: base, missingBase: true, variants: variants.sort() } as any);
          }
        }

        return { content: [{ type: "text", text: JSON.stringify(listing, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }] };
      }
    }
  );
}
