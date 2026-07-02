/**
 * SpecLoader — 4-layer fallback resolution and in-memory spec model.
 *
 * Layer order under test:
 *   1. $JSONUI_CLI_PATH  2. ./.jsonui-cli/  3. ~/.jsonui-cli/  4. bundled data/
 */
import { utimesSync } from "fs";
import { join, resolve, sep } from "path";
import { pathToFileURL } from "url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SpecLoader, mcpRootFromImportMetaUrl } from "../src/spec_loader.js";
import {
  cleanupTempDirs,
  makeBundledDataset,
  makeCliDataset,
  makeTempDir,
  writeJson,
  FIXTURE_ATTRIBUTE_DEFINITIONS,
  FIXTURE_COMPONENT_METADATA,
} from "./helpers.js";

const originalCwd = process.cwd();

/** An empty dir used as cwd so layer 2 never accidentally resolves. */
function neutralCwd(): string {
  const dir = makeTempDir("cwd");
  process.chdir(dir);
  return dir;
}

/** Point layer 3 (~/.jsonui-cli) at a fresh empty home. */
function neutralHome(): string {
  const home = makeTempDir("home");
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  return home;
}

beforeEach(() => {
  delete process.env.JSONUI_CLI_PATH;
  neutralHome();
  neutralCwd();
});

afterEach(() => {
  process.chdir(originalCwd);
  cleanupTempDirs();
});

// ----- layer resolution ----------------------------------------------------

describe("SpecLoader 4-layer fallback", () => {
  it("layer 1: resolves from $JSONUI_CLI_PATH when set", () => {
    const cliRoot = makeTempDir("env-cli");
    makeCliDataset(cliRoot);
    process.env.JSONUI_CLI_PATH = cliRoot;

    const loader = new SpecLoader(makeTempDir("mcp-root"));
    const source = loader.getDataSource();

    expect(source.attributeDefinitions.layer).toBe("env");
    expect(source.attributeDefinitions.path).toBe(
      join(resolve(cliRoot), "shared", "core", "attribute_definitions.json")
    );
    expect(source.componentMetadata.layer).toBe("env");
  });

  it("layer 2: resolves from ./.jsonui-cli/ in cwd when env layer is absent", () => {
    const projectDir = makeTempDir("proj");
    makeCliDataset(join(projectDir, ".jsonui-cli"));
    process.chdir(projectDir);

    const loader = new SpecLoader(makeTempDir("mcp-root"));
    const source = loader.getDataSource();

    expect(source.attributeDefinitions.layer).toBe("cwd");
    expect(source.componentMetadata.layer).toBe("cwd");
  });

  it("layer 3: resolves from ~/.jsonui-cli/ when env + cwd layers are absent", () => {
    const home = makeTempDir("home-with-cli");
    makeCliDataset(join(home, ".jsonui-cli"));
    process.env.HOME = home;
    process.env.USERPROFILE = home;

    const loader = new SpecLoader(makeTempDir("mcp-root"));
    const source = loader.getDataSource();

    expect(source.attributeDefinitions.layer).toBe("home");
    expect(source.componentMetadata.layer).toBe("home");
  });

  it("layer 4: resolves from the bundled data/ snapshot as last resort", () => {
    const mcpRoot = makeTempDir("mcp-root");
    makeBundledDataset(mcpRoot);

    const loader = new SpecLoader(mcpRoot);
    const source = loader.getDataSource();

    expect(source.attributeDefinitions.layer).toBe("bundled");
    expect(source.attributeDefinitions.path).toBe(
      join(mcpRoot, "data", "attribute_definitions.json")
    );
    expect(source.componentMetadata.layer).toBe("bundled");
  });

  it("higher-priority layers win: env > cwd > home > bundled", () => {
    const cliRoot = makeTempDir("env-cli");
    makeCliDataset(cliRoot);
    process.env.JSONUI_CLI_PATH = cliRoot;

    const projectDir = makeTempDir("proj");
    makeCliDataset(join(projectDir, ".jsonui-cli"));
    process.chdir(projectDir);

    const home = makeTempDir("home-with-cli");
    makeCliDataset(join(home, ".jsonui-cli"));
    process.env.HOME = home;
    process.env.USERPROFILE = home;

    const mcpRoot = makeTempDir("mcp-root");
    makeBundledDataset(mcpRoot);

    expect(
      new SpecLoader(mcpRoot).getDataSource().attributeDefinitions.layer
    ).toBe("env");

    delete process.env.JSONUI_CLI_PATH;
    expect(
      new SpecLoader(mcpRoot).getDataSource().attributeDefinitions.layer
    ).toBe("cwd");

    process.chdir(makeTempDir("empty-cwd"));
    expect(
      new SpecLoader(mcpRoot).getDataSource().attributeDefinitions.layer
    ).toBe("home");
  });

  it("a set-but-missing $JSONUI_CLI_PATH falls through to lower layers", () => {
    process.env.JSONUI_CLI_PATH = makeTempDir("empty-env-cli");
    const mcpRoot = makeTempDir("mcp-root");
    makeBundledDataset(mcpRoot);

    const source = new SpecLoader(mcpRoot).getDataSource();
    expect(source.attributeDefinitions.layer).toBe("bundled");
  });

  it("resolves each file independently (attrs from env, metadata from bundled)", () => {
    const cliRoot = makeTempDir("env-cli");
    makeCliDataset(cliRoot, { omitComponentMetadata: true });
    process.env.JSONUI_CLI_PATH = cliRoot;

    const mcpRoot = makeTempDir("mcp-root");
    makeBundledDataset(mcpRoot);

    const source = new SpecLoader(mcpRoot).getDataSource();
    expect(source.attributeDefinitions.layer).toBe("env");
    expect(source.componentMetadata.layer).toBe("bundled");
  });

  it("throws a diagnostic error listing every tried layer when all 4 miss", () => {
    process.env.JSONUI_CLI_PATH = makeTempDir("empty-env-cli");
    const mcpRoot = makeTempDir("empty-mcp-root");

    let error: Error | null = null;
    try {
      new SpecLoader(mcpRoot);
    } catch (e) {
      error = e as Error;
    }

    expect(error).not.toBeNull();
    expect(error!.message).toContain("jsonui-cli file not found");
    expect(error!.message).toContain("[env]");
    expect(error!.message).toContain("[cwd]");
    expect(error!.message).toContain("[home]");
    expect(error!.message).toContain("[bundled]");
    expect(error!.message).toContain("JSONUI_CLI_PATH");
  });

  it("omits the [env] candidate when $JSONUI_CLI_PATH is unset", () => {
    const mcpRoot = makeTempDir("empty-mcp-root");
    expect(() => new SpecLoader(mcpRoot)).toThrowError(/jsonui-cli file not found/);
    try {
      new SpecLoader(mcpRoot);
    } catch (e) {
      expect((e as Error).message).not.toContain("[env]");
    }
  });
});

// ----- freshness -----------------------------------------------------------

describe("SpecLoader freshness buckets", () => {
  function loaderWithMtimeAge(days: number): SpecLoader {
    const mcpRoot = makeTempDir("mcp-root");
    makeBundledDataset(mcpRoot);
    const when = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    for (const file of ["attribute_definitions.json", "component_metadata.json"]) {
      utimesSync(join(mcpRoot, "data", file), when, when);
    }
    return new SpecLoader(mcpRoot);
  }

  it("<= 30 days is fresh", () => {
    const source = loaderWithMtimeAge(10).getDataSource();
    expect(source.attributeDefinitions.freshness).toBe("fresh");
    expect(source.componentMetadata.freshness).toBe("fresh");
  });

  it("31-90 days is aging", () => {
    expect(loaderWithMtimeAge(45).getDataSource().attributeDefinitions.freshness).toBe(
      "aging"
    );
  });

  it("> 90 days is stale", () => {
    expect(loaderWithMtimeAge(120).getDataSource().attributeDefinitions.freshness).toBe(
      "stale"
    );
  });

  it("reports lastModified as ISO 8601", () => {
    const source = loaderWithMtimeAge(10).getDataSource();
    expect(source.attributeDefinitions.lastModified).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/
    );
  });
});

// ----- spec model built from the fixture dataset ---------------------------

describe("SpecLoader spec model", () => {
  let loader: SpecLoader;

  beforeEach(() => {
    const mcpRoot = makeTempDir("mcp-root");
    makeBundledDataset(mcpRoot);
    loader = new SpecLoader(mcpRoot);
  });

  it("counts components (skipping _-prefixed keys and 'common')", () => {
    const source = loader.getDataSource();
    expect(source.componentCount).toBe(3); // Label, TextField, Button
    expect(loader.listComponents().sort()).toEqual(["Button", "Label", "TextField"]);
  });

  it("counts common attributes, skipping _-prefixed keys", () => {
    // width, padding, background, onClick, glowIntensity (not _meta)
    expect(loader.getDataSource().commonAttributeCount).toBe(5);
  });

  it("getComponent is case-insensitive", () => {
    expect(loader.getComponent("label")?.name).toBe("Label");
    expect(loader.getComponent("LABEL")?.name).toBe("Label");
    expect(loader.getComponent("Nope")).toBeNull();
  });

  it("expands aliases from component metadata (case-insensitive)", () => {
    expect(loader.getComponent("Text")?.name).toBe("Label");
    expect(loader.getComponent("input")?.name).toBe("TextField");
    expect(loader.getComponent("EDITTEXT")?.name).toBe("TextField");
  });

  it("skips _-prefixed attribute keys inside a component", () => {
    const label = loader.getComponent("Label")!;
    expect(Object.keys(label.attributes).sort()).toEqual(["fontSize", "text"]);
  });

  it("derives read-only bindingBehavior for binding attrs without a declared direction", () => {
    const label = loader.getComponent("Label")!;
    expect(label.bindingBehavior).toEqual({ text: { direction: "read-only" } });
  });

  it("derives two-way bindingBehavior when binding_direction is declared", () => {
    const field = loader.getComponent("TextField")!;
    expect(field.bindingBehavior.text).toEqual({ direction: "two-way" });
    // hint is not a binding attr — no entry.
    expect(field.bindingBehavior.hint).toBeUndefined();
  });

  it("merges metadata platforms over the all-true default", () => {
    const label = loader.getComponent("Label")!;
    expect(label.platforms).toEqual({
      swift_generated: true,
      swift_dynamic: true,
      kotlin_generated: true,
      kotlin_dynamic: true,
      react: false,
    });
    expect(label.description).toBe("Text display component");
    expect(label.rules).toEqual(["Prefer fontColor over textColor"]);
    expect(label.platformSpecific).toEqual({ swift: { renderer: "SwiftUI Text" } });
  });

  it("falls back to default metadata for components without a metadata entry", () => {
    const button = loader.getComponent("Button")!;
    expect(button.description).toBe("Button component");
    expect(button.aliases).toEqual([]);
    expect(button.platforms.react).toBe(true);
    expect(button.rules).toEqual([]);
  });

  it("getComponentWithCommon attaches categorized common attributes", () => {
    const withCommon = loader.getComponentWithCommon("Label");
    expect(withCommon.commonAttributes.categories.sizing.width).toBeDefined();
    expect(withCommon.commonAttributes.categories.spacing.padding).toBeDefined();
    expect(withCommon.commonAttributes.categories.visual.background).toBeDefined();
    expect(withCommon.commonAttributes.categories.other.glowIntensity).toBeDefined();
    expect(loader.getComponentWithCommon("Nope")).toBeNull();
  });

  it("getAttribute resolves common attributes with their category", () => {
    const attr = loader.getAttribute("onClick");
    expect(attr).toMatchObject({
      name: "onClick",
      category: "interaction",
      scope: "common",
      components: "all",
    });
    expect(attr.definition.type).toBe("binding");
  });

  it("getAttribute resolves a single component-scoped attribute", () => {
    const attr = loader.getAttribute("fontSize");
    expect(attr).toMatchObject({
      name: "fontSize",
      scope: "component",
      component: "Label",
    });
  });

  it("getAttribute returns a matches array when several components define it", () => {
    const attr = loader.getAttribute("text");
    expect(attr.matches).toHaveLength(2);
    const byComponent = Object.fromEntries(
      attr.matches.map((m: any) => [m.component, m])
    );
    expect(byComponent.Label.bindingBehavior).toEqual({ direction: "read-only" });
    expect(byComponent.TextField.bindingBehavior).toEqual({ direction: "two-way" });
  });

  it("getAttribute returns null for unknown attributes", () => {
    expect(loader.getAttribute("noSuchAttr")).toBeNull();
  });

  it("searchComponents scores name > alias > description > attribute > rule and sorts desc", () => {
    const results = loader.searchComponents("text");
    expect(results.length).toBeGreaterThanOrEqual(2);
    // TextField matches by name (10) — must outrank Label (alias 8 at best).
    expect(results[0].component).toBe("TextField");
    const scores = results.map((r: any) => r.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));

    const label = results.find((r: any) => r.component === "Label");
    expect(label.matches).toContain("alias: Text");
  });

  it("searchComponents matches common attributes with score 4", () => {
    const results = loader.searchComponents("zebra"); // only in glowIntensity description
    expect(results).toEqual([
      { component: "common", score: 4, matches: ["common.other.glowIntensity"] },
    ]);
  });

  it("searchComponents returns [] when nothing matches", () => {
    expect(loader.searchComponents("qqqqqq")).toEqual([]);
  });
});

// ----- root helper ----------------------------------------------------------

describe("mcpRootFromImportMetaUrl", () => {
  it("returns the parent directory of the module's directory", () => {
    const root = makeTempDir("pkg");
    const moduleUrl = pathToFileURL(join(root, "dist", "index.js")).href;
    expect(mcpRootFromImportMetaUrl(moduleUrl)).toBe(resolve(root));
  });

  it("handles nested module paths", () => {
    const root = makeTempDir("pkg");
    const moduleUrl = pathToFileURL(
      join(root, "dist", "tools", "spec", "x.js")
    ).href;
    expect(mcpRootFromImportMetaUrl(moduleUrl)).toBe(
      resolve(join(root, "dist", "tools"))
    );
  });
});

// Guard: fixture project dirs never collide with path separators oddities.
describe("fixture sanity", () => {
  it("temp fixtures live outside the repo", () => {
    const dir = makeTempDir("sanity");
    expect(dir.includes(`${sep}jui-mcp-test-`)).toBe(true);
    writeJson(join(dir, "x.json"), { ok: true });
  });
});
