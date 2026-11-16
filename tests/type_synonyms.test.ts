/**
 * Type spellings the build accepts for a section they are not
 * (jsonui-cli shared/core/type_synonyms.json, 1.9.0). Until then
 * lookup_component answered "not found" for `ProgressBar`, which the build
 * draws as a Progress: the server knew `_alias_of` sections and metadata
 * aliases only (ticket mcp-lookup-component-does-not-know-type-synonyms).
 *
 * The loader must FOLLOW the file, not agree with it by coincidence: the
 * synthetic canon below names spellings no real table has, and one arm edits
 * the file under a running loader.
 */
import { writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SpecLoader } from "../src/spec_loader.js";
import { register as registerLookupComponent } from "../src/tools/spec/lookup_component.js";
import { register as registerSearchComponents } from "../src/tools/spec/search_components.js";
import { register as registerDataSource } from "../src/tools/spec/get_data_source.js";
import {
  cleanupTempDirs,
  createToolHarness,
  makeCliDataset,
  makeTempDir,
  writeJson,
  FIXTURE_ATTRIBUTE_DEFINITIONS,
} from "./helpers.js";

const originalCwd = process.cwd();
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const DEFINITIONS = {
  ...FIXTURE_ATTRIBUTE_DEFINITIONS,
  View: { orientation: { type: "string", enum: ["horizontal", "vertical"], description: "Stack axis" } },
  Image: { src: { type: "string", description: "Image source" } },
};

const SYNONYMS = {
  _description: ["test fixture — spellings no real table has"],
  synonyms: {
    Tappable: { canonical: "Button" },
    Lane: { canonical: "View", orientation: "horizontal" },
    Roundel: { canonical: "Image", render_as: "CircleImage" },
    // A section of its own (`_alias_of` Button) and a metadata alias of
    // Label: the exact match is found first, as in the tools.
    Flip: { canonical: "Label" },
    Text: { canonical: "Button" },
    // Its canonical is not a section here.
    Ghost: { canonical: "NoSuchSection" },
  },
};

function checkout(synonyms: unknown | null): string {
  const root = makeTempDir("cli");
  makeCliDataset(root, { attributeDefinitions: DEFINITIONS });
  if (synonyms !== null) writeJson(join(root, "shared", "core", "type_synonyms.json"), synonyms);
  process.env.JSONUI_CLI_PATH = root;
  return root;
}

beforeEach(() => {
  delete process.env.JSONUI_CLI_PATH;
  const home = makeTempDir("home");
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.chdir(makeTempDir("cwd"));
});

afterEach(() => {
  delete process.env.JSONUI_CLI_PATH;
  process.chdir(originalCwd);
  cleanupTempDirs();
});

describe("lookup through type_synonyms.json", () => {
  it("resolves a synonym to its canonical section and says so", () => {
    checkout(SYNONYMS);
    const loader = new SpecLoader(makeTempDir("mcp-root"));

    const tappable = loader.getComponentWithCommon("Tappable");
    expect(tappable.name).toBe("Button");
    expect(tappable.typeSynonym).toEqual({
      spelling: "Tappable",
      canonical: "Button",
      source: "shared/core/type_synonyms.json",
    });

    expect(loader.getComponentWithCommon("lane").typeSynonym).toMatchObject({
      canonical: "View",
      implies: { orientation: "horizontal" },
    });
    expect(loader.getComponentWithCommon("Roundel")).toMatchObject({
      name: "Image",
      typeSynonym: { canonical: "Image", renderAs: "CircleImage" },
    });
  });

  it("finds a section, an `_alias_of` section and a metadata alias first", () => {
    checkout(SYNONYMS);
    const loader = new SpecLoader(makeTempDir("mcp-root"));

    expect(loader.getComponentWithCommon("Flip")).toMatchObject({ name: "Button" });
    expect(loader.getComponentWithCommon("Flip").typeSynonym).toBeUndefined();
    expect(loader.getComponentWithCommon("Text")).toMatchObject({ name: "Label" });
    expect(loader.getComponentWithCommon("Text").typeSynonym).toBeUndefined();
  });

  it("skips an entry whose canonical is not a section", () => {
    checkout(SYNONYMS);
    expect(new SpecLoader(makeTempDir("mcp-root")).getComponentWithCommon("Ghost")).toBeNull();
  });

  it("knows no synonym without the file (jsonui-cli before 1.9.0)", () => {
    checkout(null);
    const loader = new SpecLoader(makeTempDir("mcp-root"));
    expect(loader.getComponentWithCommon("Tappable")).toBeNull();
    expect(loader.getDataSource().typeSynonyms).toBeNull();
  });

  it("follows an edit to the file under a running server", () => {
    const root = checkout(SYNONYMS);
    const loader = new SpecLoader(makeTempDir("mcp-root"));
    expect(loader.getComponentWithCommon("Pressable")).toBeNull();

    const path = join(root, "shared", "core", "type_synonyms.json");
    writeJson(path, { synonyms: { ...SYNONYMS.synonyms, Pressable: { canonical: "Button" } } });
    expect(loader.refreshIfChanged()).toEqual([path]);
    expect(loader.getComponentWithCommon("Pressable")).toMatchObject({ name: "Button" });
  });

  it("keeps the last synonyms that parsed when the file is half-written", () => {
    const root = checkout(SYNONYMS);
    const loader = new SpecLoader(makeTempDir("mcp-root"));

    writeFileSync(join(root, "shared", "core", "type_synonyms.json"), '{"synonyms": {"Tapp');
    loader.refreshIfChanged();
    expect(loader.getLastReload()).toMatchObject({ ok: false });
    expect(loader.getComponentWithCommon("Tappable")).toMatchObject({ name: "Button" });
  });

  it("matches a synonym's spelling in search_components", () => {
    checkout(SYNONYMS);
    const results = new SpecLoader(makeTempDir("mcp-root")).searchComponents("tappab");
    expect(results).toContainEqual(
      expect.objectContaining({ component: "Button", matches: ["type synonym: Tappable"] })
    );
  });
});

describe("the tools", () => {
  it("lookup_component answers a synonym, and get_data_source names the file", async () => {
    const root = checkout(SYNONYMS);
    const loader = new SpecLoader(makeTempDir("mcp-root"));
    const harness = createToolHarness();
    registerLookupComponent(harness.server, loader);
    registerSearchComponents(harness.server, loader);
    registerDataSource(harness.server, loader);

    const found = JSON.parse(await harness.call("lookup_component", { name: "Lane" }));
    expect(found.name).toBe("View");
    expect(found.typeSynonym.implies).toEqual({ orientation: "horizontal" });

    const source = JSON.parse(await harness.call("get_data_source"));
    expect(source.typeSynonyms.path).toBe(join(root, "shared", "core", "type_synonyms.json"));
  });
});

// The measured case, on the committed snapshot: `ProgressBar` was "not found".
describe("the bundled snapshot", () => {
  it("resolves ProgressBar, which the build accepts", () => {
    const loader = new SpecLoader(repoRoot);
    expect(loader.getDataSource().typeSynonyms?.layer).toBe("bundled");
    const spec = loader.getComponentWithCommon("ProgressBar");
    expect(spec).not.toBeNull();
    expect(spec.typeSynonym).toMatchObject({ spelling: "ProgressBar", canonical: spec.name });
  });
});
