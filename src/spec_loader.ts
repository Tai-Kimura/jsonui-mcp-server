import { existsSync, readFileSync, statSync } from "fs";
import { homedir } from "os";
import { join, resolve } from "path";
import { fileURLToPath } from "url";

import {
  BINDING_RULES,
  MODIFIER_ORDER,
  PLATFORM_MAPPING,
  categorizeCommonAttributes,
} from "./data/derived.js";

export interface ComponentMetadata {
  description: string;
  aliases: string[];
  platforms: {
    swift_generated: boolean;
    swift_dynamic: boolean;
    kotlin_generated: boolean;
    kotlin_dynamic: boolean;
    react: boolean;
  };
  platformSpecific: Record<string, Record<string, string>>;
  rules: string[];
}

export interface ComponentSpec {
  name: string;
  description: string;
  aliases: string[];
  platforms: Record<string, boolean>;
  attributes: Record<string, any>;
  bindingBehavior: Record<string, any>;
  platformSpecific: Record<string, any>;
  rules: string[];
}

export type FallbackLayer = "env" | "cwd" | "home" | "bundled";

export interface FileInfo {
  /** Which fallback layer provided the file. */
  layer: FallbackLayer;
  /** Absolute path actually loaded. */
  path: string;
  /** ISO 8601 mtime. */
  lastModified: string;
  /** Freshness bucket. "fresh" <= 30d, "aging" <= 90d, "stale" > 90d. */
  freshness: "fresh" | "aging" | "stale";
}

export interface DataSourceInfo {
  attributeDefinitions: FileInfo;
  componentMetadata: FileInfo;
  /// Present only when the optional canon file resolved. Reported for the
  /// same reason as the two above: a caller who cannot see WHICH file the
  /// running server read has no way to tell a stale snapshot from a server
  /// that simply has not been restarted.
  screenIdentity: FileInfo | null;
  bindingSemantics: FileInfo | null;
  /// conformance/coverage.json — declared-but-unimplemented (component,
  /// attribute, platform) pairs with their recorded reasons. Optional: absent
  /// on older jsonui-cli checkouts.
  coverage: FileInfo | null;
  componentCount: number;
  commonAttributeCount: number;
}

const ALL_PLATFORMS: ComponentMetadata["platforms"] = {
  swift_generated: true,
  swift_dynamic: true,
  kotlin_generated: true,
  kotlin_dynamic: true,
  react: true,
};

const DEFAULT_METADATA: ComponentMetadata = {
  description: "",
  aliases: [],
  platforms: ALL_PLATFORMS,
  platformSpecific: {},
  rules: [],
};

/**
 * Resolution order for each jsonui-cli data file:
 *
 *   1. `$JSONUI_CLI_PATH` env var (custom install / monorepo)
 *   2. `./.jsonui-cli/` in process.cwd() (project-local)
 *   3. `~/.jsonui-cli/` (default location of the jsonui-cli bootstrap installer)
 *   4. `<mcp-server>/data/<file>` (bundled snapshot, populated by
 *      `scripts/fetch-definitions.js` at npm install time)
 *
 * A missing higher-priority layer falls through to the next. If all four fail,
 * the loader throws — that's a hard misconfiguration.
 */
export class SpecLoader {
  private components: Map<string, ComponentSpec> = new Map();
  private commonAttributesRaw: Record<string, any> = {};
  private bindingSemantics: Record<string, any> | null = null;
  /// `${component}.${attribute}` -> [{platform, reason, note}] from the
  /// coverage ledger. The ledger tracks pairs that ARE declared (platform
  /// field includes them) but that the platform's codegen does not consume —
  /// the note explains why (backlog, alias normalization, runtime-only, ...).
  private coverageGaps: Map<string, any[]> | null = null;
  private screenIdentity: Record<string, any> | null = null;
  private commonAttributes: any = null;
  private aliasMap: Map<string, string> = new Map();
  private metadata: Record<string, ComponentMetadata> = {};
  private dataSource!: DataSourceInfo;
  /** When this process read the files. Data is cached in memory from then
   *  on, so a file edited later is not what the server is serving. */
  private loadedAt: string = new Date().toISOString();

  constructor(private mcpRootDir: string) {
    this.load();
  }

  // ----- public API ------------------------------------------------------

  getComponent(name: string): ComponentSpec | null {
    const key = name.toLowerCase();
    const resolved = this.aliasMap.get(key) || key;
    return this.components.get(resolved) || null;
  }

  getComponentWithCommon(name: string): any {
    const comp = this.getComponent(name);
    if (!comp) return null;
    return { ...comp, commonAttributes: this.commonAttributes };
  }

  getAttribute(name: string): any {
    if (this.commonAttributes?.categories) {
      for (const [category, attrs] of Object.entries(
        this.commonAttributes.categories
      )) {
        const attrMap = attrs as Record<string, any>;
        if (attrMap[name]) {
          return this.withImplementationGaps(`common.${name}`, {
            name,
            category,
            scope: "common",
            definition: attrMap[name],
            components: "all",
          });
        }
      }
    }

    const results: any[] = [];
    for (const comp of this.components.values()) {
      if (comp.attributes[name]) {
        results.push(
          this.withImplementationGaps(`${comp.name}.${name}`, {
            name,
            scope: "component",
            component: comp.name,
            definition: comp.attributes[name],
            bindingBehavior: comp.bindingBehavior?.[name],
          })
        );
      }
    }

    if (results.length === 1) return results[0];
    if (results.length > 1) return { name, matches: results };
    return null;
  }

  /// Attach the coverage ledger's record for this (component, attribute) when
  /// one exists: platforms that DECLARE the attribute but whose codegen does
  /// not consume it, each with the recorded reason. Complements the
  /// definition's own `platform` (declared surface) and `platform_reasons`
  /// (why a platform is excluded from the declaration).
  private withImplementationGaps(key: string, result: Record<string, any>) {
    const gaps = this.coverageGaps?.get(key);
    if (gaps && gaps.length > 0) {
      return { ...result, implementationGaps: gaps };
    }
    return result;
  }

  searchComponents(query: string): any[] {
    const q = query.toLowerCase();
    const results: any[] = [];

    for (const comp of this.components.values()) {
      let score = 0;
      const matches: string[] = [];

      if (comp.name.toLowerCase().includes(q)) {
        score += 10;
        matches.push(`name: ${comp.name}`);
      }
      if (comp.description.toLowerCase().includes(q)) {
        score += 5;
        matches.push(`description: ${comp.description}`);
      }
      for (const alias of comp.aliases) {
        if (alias.toLowerCase().includes(q)) {
          score += 8;
          matches.push(`alias: ${alias}`);
        }
      }
      for (const attrName of Object.keys(comp.attributes)) {
        if (attrName.toLowerCase().includes(q)) {
          score += 3;
          matches.push(`attribute: ${attrName}`);
        }
      }
      for (const rule of comp.rules) {
        if (rule.toLowerCase().includes(q)) {
          score += 2;
          matches.push(`rule: ${rule}`);
        }
      }

      if (score > 0) results.push({ component: comp.name, score, matches });
    }

    if (this.commonAttributes?.categories) {
      for (const [category, attrs] of Object.entries(
        this.commonAttributes.categories
      )) {
        const attrMap = attrs as Record<string, any>;
        for (const [attrName, attrDef] of Object.entries(attrMap)) {
          if (
            attrName.toLowerCase().includes(q) ||
            (attrDef as any)?.description?.toLowerCase().includes(q)
          ) {
            results.push({
              component: "common",
              score: 4,
              matches: [`common.${category}.${attrName}`],
            });
          }
        }
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }

  getModifierOrder(platform?: string): any {
    if (platform) return (MODIFIER_ORDER as any)[platform] || null;
    return MODIFIER_ORDER;
  }

  /**
   * The canonical screen-identity asset, or null when this checkout predates
   * it. Served verbatim: it is a declaration, not something to restate.
   */
  /** ISO 8601 timestamp of when this process loaded its data files. */
  getLoadedAt(): string {
    return this.loadedAt;
  }

  /**
   * Paths whose mtime has moved since this process read them.
   *
   * Compares against the mtime recorded AT LOAD, not against a wall-clock
   * timestamp: "was this file edited after I read it" is a question about
   * the file, and comparing a file mtime to Date.now() is a race whenever
   * the two land in the same millisecond.
   */
  getChangedSinceLoad(): string[] {
    const tracked = [
      this.dataSource.attributeDefinitions,
      this.dataSource.componentMetadata,
      this.dataSource.screenIdentity,
      this.dataSource.bindingSemantics,
    ].filter((f): f is FileInfo => f != null);

    const changed: string[] = [];
    for (const file of tracked) {
      try {
        const now = statSync(file.path).mtime.toISOString();
        if (now !== file.lastModified) changed.push(file.path);
      } catch {
        // Disappeared since load — also a reason to restart.
        changed.push(file.path);
      }
    }
    return changed;
  }

  getScreenIdentity(): any {
    return this.screenIdentity;
  }

  getBindingRules(): any {
    // BINDING_RULES carries the author-facing syntax guidance; the
    // canonical resolution SEMANTICS (dot paths, `??` defaults,
    // unresolved-key behavior, negation, coercion — SSoT:
    // shared/core/binding_semantics.json) is attached when available so
    // the MCP never re-states semantics by hand again.
    if (!this.bindingSemantics) return BINDING_RULES;
    return {
      ...BINDING_RULES,
      semanticsVersion: this.bindingSemantics.version,
      semantics: this.bindingSemantics,
    };
  }

  getPlatformMapping(category?: string): any {
    if (category) return (PLATFORM_MAPPING as any)[category] || null;
    return PLATFORM_MAPPING;
  }

  listComponents(): string[] {
    return Array.from(this.components.values()).map((c) => c.name);
  }

  getDataSource(): DataSourceInfo {
    return this.dataSource;
  }

  // ----- load pipeline ---------------------------------------------------

  private load(): void {
    const attrResolution = this.resolveFile(
      "shared/core/attribute_definitions.json",
      "data/attribute_definitions.json"
    );
    const metaResolution = this.resolveFile(
      "shared/core/component_metadata.json",
      "data/component_metadata.json"
    );

    const raw = JSON.parse(readFileSync(attrResolution.path, "utf-8")) as Record<
      string,
      any
    >;
    const metaRaw = JSON.parse(
      readFileSync(metaResolution.path, "utf-8")
    ) as Record<string, any>;

    let bindingResolution: FileInfo | null = null;
    let screenIdentityResolution: FileInfo | null = null;

    // Canonical binding-resolution semantics (renderer SSoT track 15).
    // Optional so older jsonui-cli checkouts without the file still load.
    try {
      const semanticsResolution = this.resolveFile(
        "shared/core/binding_semantics.json",
        "data/binding_semantics.json"
      );
      this.bindingSemantics = JSON.parse(
        readFileSync(semanticsResolution.path, "utf-8")
      ) as Record<string, any>;
      bindingResolution = semanticsResolution;
    } catch {
      this.bindingSemantics = null;
    }

    // Canonical screen identity (screen-identity track). Optional so older
    // jsonui-cli checkouts without the file still load.
    try {
      const screenResolution = this.resolveFile(
        "shared/core/screen_identity.json",
        "data/screen_identity.json"
      );
      this.screenIdentity = JSON.parse(
        readFileSync(screenResolution.path, "utf-8")
      ) as Record<string, any>;
      screenIdentityResolution = screenResolution;
    } catch {
      this.screenIdentity = null;
    }

    // Conformance coverage ledger: declared-but-unimplemented pairs with
    // recorded reasons. Optional for the same backward-compat reason.
    let coverageResolution: FileInfo | null = null;
    try {
      const coverage = this.resolveFile(
        "conformance/coverage.json",
        "data/coverage.json"
      );
      const doc = JSON.parse(readFileSync(coverage.path, "utf-8")) as {
        entries?: Array<Record<string, any>>;
      };
      const gaps = new Map<string, any[]>();
      for (const entry of doc.entries ?? []) {
        const key = `${entry.component}.${entry.attribute}`;
        const list = gaps.get(key) ?? [];
        for (const platform of entry.platforms ?? []) {
          list.push({
            platform,
            reason: entry.reason ?? "",
            note: entry.note ?? "",
          });
        }
        gaps.set(key, list);
      }
      this.coverageGaps = gaps;
      coverageResolution = coverage;
    } catch {
      this.coverageGaps = null;
    }

    this.metadata = {};
    for (const [name, meta] of Object.entries(metaRaw)) {
      if (name.startsWith("_")) continue;
      if (typeof meta !== "object" || meta === null) continue;
      this.metadata[name] = this.normalizeMetadata(meta);
    }

    this.commonAttributesRaw = raw.common || {};
    this.commonAttributes = categorizeCommonAttributes(this.commonAttributesRaw);

    let componentCount = 0;
    for (const [compName, compAttrs] of Object.entries(raw)) {
      if (compName.startsWith("_") || compName === "common") continue;
      if (typeof compAttrs !== "object" || compAttrs === null) continue;

      const spec = this.buildComponentSpec(compName, compAttrs);
      const key = compName.toLowerCase();
      this.components.set(key, spec);
      for (const alias of spec.aliases) {
        this.aliasMap.set(alias.toLowerCase(), key);
      }
      componentCount++;
    }

    this.dataSource = {
      attributeDefinitions: attrResolution,
      componentMetadata: metaResolution,
      screenIdentity: screenIdentityResolution,
      bindingSemantics: bindingResolution,
      coverage: coverageResolution,
      componentCount,
      commonAttributeCount: Object.keys(this.commonAttributesRaw).filter(
        (k) => !k.startsWith("_")
      ).length,
    };
  }

  private normalizeMetadata(raw: Record<string, any>): ComponentMetadata {
    return {
      description: raw.description ?? "",
      aliases: Array.isArray(raw.aliases) ? raw.aliases : [],
      platforms: {
        ...ALL_PLATFORMS,
        ...(raw.platforms ?? {}),
      },
      platformSpecific:
        typeof raw.platformSpecific === "object" && raw.platformSpecific
          ? raw.platformSpecific
          : {},
      rules: Array.isArray(raw.rules) ? raw.rules : [],
    };
  }

  private getMetadata(componentName: string): ComponentMetadata {
    return (
      this.metadata[componentName] ?? {
        ...DEFAULT_METADATA,
        description: `${componentName} component`,
      }
    );
  }

  private buildComponentSpec(
    name: string,
    attrs: Record<string, any>
  ): ComponentSpec {
    const meta = this.getMetadata(name);

    const attributes: Record<string, any> = {};
    const bindingBehavior: Record<string, any> = {};

    for (const [attrName, attrDef] of Object.entries(attrs)) {
      if (attrName.startsWith("_")) continue;
      attributes[attrName] = attrDef;

      const attrType = (attrDef as any)?.type;
      let hasBinding = false;
      if (Array.isArray(attrType)) hasBinding = attrType.includes("binding");
      else if (attrType === "binding") hasBinding = true;

      if (hasBinding) {
        const declared = (attrDef as any)?.binding_direction;
        bindingBehavior[attrName] = {
          direction: declared === "two-way" ? "two-way" : "read-only",
        };
      }
    }

    return {
      name,
      description: meta.description || `${name} component`,
      aliases: meta.aliases,
      platforms: meta.platforms,
      attributes,
      bindingBehavior,
      platformSpecific: meta.platformSpecific,
      rules: meta.rules,
    };
  }

  /**
   * Resolve a jsonui-cli file through the 4-layer fallback and return FileInfo.
   * @param cliRelPath  Path inside a jsonui-cli checkout (e.g. "shared/core/attribute_definitions.json")
   * @param bundledRelPath  Path inside this MCP's root (e.g. "data/attribute_definitions.json")
   */
  private resolveFile(cliRelPath: string, bundledRelPath: string): FileInfo {
    const candidates: Array<{ path: string; layer: FallbackLayer }> = [];

    const env = process.env.JSONUI_CLI_PATH;
    if (env) {
      candidates.push({ path: join(resolve(env), cliRelPath), layer: "env" });
    }
    candidates.push({
      path: join(process.cwd(), ".jsonui-cli", cliRelPath),
      layer: "cwd",
    });
    candidates.push({
      path: join(homedir(), ".jsonui-cli", cliRelPath),
      layer: "home",
    });
    candidates.push({
      path: join(this.mcpRootDir, bundledRelPath),
      layer: "bundled",
    });

    for (const candidate of candidates) {
      if (existsSync(candidate.path)) {
        const mtime = statSync(candidate.path).mtime;
        const ageDays = (Date.now() - mtime.getTime()) / (1000 * 60 * 60 * 24);
        const freshness: FileInfo["freshness"] =
          ageDays <= 30 ? "fresh" : ageDays <= 90 ? "aging" : "stale";
        return {
          layer: candidate.layer,
          path: candidate.path,
          lastModified: mtime.toISOString(),
          freshness,
        };
      }
    }

    const tried = candidates.map((c) => `  [${c.layer}] ${c.path}`).join("\n");
    throw new Error(
      `jsonui-cli file not found: ${cliRelPath}. Tried:\n` +
        tried +
        "\n\nInstall jsonui-cli (the bootstrap places files under ~/.jsonui-cli/),\n" +
        "or set JSONUI_CLI_PATH to point at a jsonui-cli checkout,\n" +
        "or reinstall jsonui-mcp-server so the postinstall script can fetch a bundled snapshot."
    );
  }
}

// Helper to derive the MCP server root from an import.meta.url (e.g. in index.ts).
export function mcpRootFromImportMetaUrl(url: string): string {
  const dir = fileURLToPath(new URL(".", url));
  return resolve(dir, "..");
}
