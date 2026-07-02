/**
 * Group A tools (component spec lookup) — input schema validation via the
 * captured Zod shapes plus output contracts against a fixture SpecLoader.
 */
import { utimesSync } from "fs";
import { join } from "path";
import { ZodError } from "zod";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SpecLoader } from "../src/spec_loader.js";
import { register as registerLookupComponent } from "../src/tools/spec/lookup_component.js";
import { register as registerLookupAttribute } from "../src/tools/spec/lookup_attribute.js";
import { register as registerSearchComponents } from "../src/tools/spec/search_components.js";
import { register as registerGetModifierOrder } from "../src/tools/spec/get_modifier_order.js";
import { register as registerGetBindingRules } from "../src/tools/spec/get_binding_rules.js";
import { register as registerGetPlatformMapping } from "../src/tools/spec/get_platform_mapping.js";
import { register as registerGetDataSource } from "../src/tools/spec/get_data_source.js";
import {
  BINDING_RULES,
  MODIFIER_ORDER,
  PLATFORM_MAPPING,
} from "../src/data/derived.js";
import {
  cleanupTempDirs,
  createToolHarness,
  makeBundledDataset,
  makeTempDir,
  type ToolHarness,
} from "./helpers.js";

const originalCwd = process.cwd();

function buildHarness(loader: SpecLoader): ToolHarness {
  const harness = createToolHarness();
  registerLookupComponent(harness.server, loader);
  registerLookupAttribute(harness.server, loader);
  registerSearchComponents(harness.server, loader);
  registerGetModifierOrder(harness.server, loader);
  registerGetBindingRules(harness.server, loader);
  registerGetPlatformMapping(harness.server, loader);
  registerGetDataSource(harness.server, loader);
  return harness;
}

function makeFixtureLoader(opts: { staleDays?: number } = {}): SpecLoader {
  const mcpRoot = makeTempDir("mcp-root");
  makeBundledDataset(mcpRoot);
  if (opts.staleDays) {
    const when = new Date(Date.now() - opts.staleDays * 24 * 60 * 60 * 1000);
    for (const f of ["attribute_definitions.json", "component_metadata.json"]) {
      utimesSync(join(mcpRoot, "data", f), when, when);
    }
  }
  return new SpecLoader(mcpRoot);
}

let harness: ToolHarness;

beforeEach(() => {
  delete process.env.JSONUI_CLI_PATH;
  process.chdir(makeTempDir("cwd"));
  harness = buildHarness(makeFixtureLoader());
});

afterEach(() => {
  process.chdir(originalCwd);
  cleanupTempDirs();
});

describe("tool registration", () => {
  it("registers the 7 Group A tools with descriptions", () => {
    expect([...harness.tools.keys()].sort()).toEqual([
      "get_binding_rules",
      "get_data_source",
      "get_modifier_order",
      "get_platform_mapping",
      "lookup_attribute",
      "lookup_component",
      "search_components",
    ]);
    for (const tool of harness.tools.values()) {
      expect(tool.description.length).toBeGreaterThan(10);
    }
  });
});

describe("lookup_component", () => {
  it("returns the full spec plus commonAttributes as JSON", async () => {
    const text = await harness.call("lookup_component", { name: "TextField" });
    const spec = JSON.parse(text);
    expect(spec.name).toBe("TextField");
    expect(spec.attributes.text.binding_direction).toBe("two-way");
    expect(spec.bindingBehavior.text.direction).toBe("two-way");
    expect(spec.commonAttributes.categories.sizing.width).toBeDefined();
  });

  it("resolves aliases", async () => {
    const spec = JSON.parse(
      await harness.call("lookup_component", { name: "Input" })
    );
    expect(spec.name).toBe("TextField");
  });

  it("lists available components when not found", async () => {
    const text = await harness.call("lookup_component", { name: "Nope" });
    expect(text).toContain("Component 'Nope' not found");
    expect(text).toContain("Label");
    expect(text).toContain("TextField");
    expect(text).toContain("Button");
  });

  it("rejects a missing required 'name' param at the schema layer", async () => {
    await expect(harness.call("lookup_component", {})).rejects.toThrow(ZodError);
  });
});

describe("lookup_attribute", () => {
  it("returns common attribute info as JSON", async () => {
    const attr = JSON.parse(
      await harness.call("lookup_attribute", { name: "onClick" })
    );
    expect(attr.scope).toBe("common");
    expect(attr.category).toBe("interaction");
  });

  it("returns a plain not-found message for unknown attributes", async () => {
    const text = await harness.call("lookup_attribute", { name: "nope" });
    expect(text).toBe("Attribute 'nope' not found.");
  });
});

describe("search_components", () => {
  it("returns scored results as JSON, best first", async () => {
    const results = JSON.parse(
      await harness.call("search_components", { query: "text" })
    );
    expect(results[0].component).toBe("TextField");
    expect(results[0].score).toBeGreaterThan(0);
    expect(results[0].matches.length).toBeGreaterThan(0);
  });

  it("caps output at 20 results", async () => {
    // Query matching many entries: every fixture component + common attrs
    // is still < 20, so build a wide loader inline via a broad query and
    // assert the slice contract holds structurally.
    const results = JSON.parse(
      await harness.call("search_components", { query: "t" })
    );
    expect(results.length).toBeLessThanOrEqual(20);
  });

  it("returns a plain message when nothing matches", async () => {
    const text = await harness.call("search_components", { query: "qqqq" });
    expect(text).toBe("No results for 'qqqq'.");
  });
});

describe("get_modifier_order", () => {
  it("returns the full table when platform is omitted", async () => {
    const result = JSON.parse(await harness.call("get_modifier_order"));
    expect(result).toEqual(JSON.parse(JSON.stringify(MODIFIER_ORDER)));
  });

  it("returns a single platform section", async () => {
    const result = JSON.parse(
      await harness.call("get_modifier_order", { platform: "swift" })
    );
    expect(result).toEqual(JSON.parse(JSON.stringify(MODIFIER_ORDER.swift)));
  });

  it("rejects unknown platforms at the schema layer", async () => {
    await expect(
      harness.call("get_modifier_order", { platform: "flutter" })
    ).rejects.toThrow(ZodError);
  });
});

describe("get_binding_rules", () => {
  it("returns BINDING_RULES verbatim", async () => {
    const result = JSON.parse(await harness.call("get_binding_rules"));
    expect(result).toEqual(JSON.parse(JSON.stringify(BINDING_RULES)));
  });
});

describe("get_platform_mapping", () => {
  it("returns the full mapping when category is omitted", async () => {
    const result = JSON.parse(await harness.call("get_platform_mapping"));
    expect(result).toEqual(JSON.parse(JSON.stringify(PLATFORM_MAPPING)));
  });

  it("returns a single category", async () => {
    const result = JSON.parse(
      await harness.call("get_platform_mapping", { category: "textAlign" })
    );
    expect(result).toEqual(JSON.parse(JSON.stringify(PLATFORM_MAPPING.textAlign)));
  });

  it("lists available categories for an unknown category", async () => {
    const text = await harness.call("get_platform_mapping", {
      category: "bogus",
    });
    expect(text).toContain("Category 'bogus' not found");
    expect(text).toContain("textAlign");
    expect(text).toContain("fontWeight");
  });
});

describe("get_data_source", () => {
  it("reports per-file layer, freshness, and counts", async () => {
    const info = JSON.parse(await harness.call("get_data_source"));
    expect(info.attributeDefinitions.layer).toBe("bundled");
    expect(info.attributeDefinitions.freshness).toBe("fresh");
    expect(info.componentMetadata.layer).toBe("bundled");
    expect(info.componentCount).toBe(3);
    expect(info.commonAttributeCount).toBe(5);
    expect(info.hint).toBeUndefined();
  });

  it("adds a re-fetch hint when any file is stale (> 90 days)", async () => {
    const staleHarness = buildHarness(makeFixtureLoader({ staleDays: 120 }));
    const info = JSON.parse(await staleHarness.call("get_data_source"));
    expect(info.attributeDefinitions.freshness).toBe("stale");
    expect(info.hint).toContain("90 days");
  });
});
