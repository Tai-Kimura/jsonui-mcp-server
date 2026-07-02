/**
 * Bundled snapshot validity — loads the SpecLoader against the REAL committed
 * data/ snapshot (attribute_definitions.json + component_metadata.json) by
 * forcing the 4th fallback layer. Guards against a broken snapshot refresh:
 * if `data/` ever ships in a state the server can't load or that breaks core
 * lookups, these tests fail.
 *
 * The env/cwd/home layers are neutralized so the test only ever reads the
 * files committed in this repo.
 */
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SpecLoader } from "../src/spec_loader.js";
import { cleanupTempDirs, makeTempDir } from "./helpers.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const originalCwd = process.cwd();
let loader: SpecLoader;

beforeAll(() => {
  delete process.env.JSONUI_CLI_PATH;
  const home = makeTempDir("home");
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.chdir(makeTempDir("cwd"));
  loader = new SpecLoader(repoRoot);
});

afterAll(() => {
  process.chdir(originalCwd);
  cleanupTempDirs();
});

describe("bundled data/ snapshot", () => {
  it("loads via the bundled layer from this repo's data/ directory", () => {
    const source = loader.getDataSource();
    expect(source.attributeDefinitions.layer).toBe("bundled");
    expect(source.attributeDefinitions.path).toBe(
      join(repoRoot, "data", "attribute_definitions.json")
    );
    expect(source.componentMetadata.layer).toBe("bundled");
  });

  it("contains a sane component and common-attribute population", () => {
    const source = loader.getDataSource();
    expect(source.componentCount).toBeGreaterThanOrEqual(25);
    expect(source.commonAttributeCount).toBeGreaterThanOrEqual(100);
  });

  it("includes every core component", () => {
    const components = loader.listComponents();
    for (const name of [
      "View",
      "Label",
      "TextField",
      "Button",
      "Image",
      "NetworkImage",
      "ScrollView",
      "Collection",
      "SelectBox",
      "Switch",
      "Toggle",
      "Segment",
      "Slider",
      "Progress",
      "Radio",
      "CheckBox",
      "Indicator",
      "SafeAreaView",
      "TabView",
      "Web",
      "Embed",
    ]) {
      expect(components, `missing component: ${name}`).toContain(name);
    }
  });

  it("serves the $jui meta-attribute from the common section", () => {
    const attr = loader.getAttribute("$jui");
    expect(attr).not.toBeNull();
    expect(attr.scope).toBe("common");
    expect(attr.definition.type).toBe("object");
    expect(attr.definition.description).toContain("normalize");
  });

  it("resolves the canonical component aliases", () => {
    expect(loader.getComponent("Text")?.name).toBe("Label");
    expect(loader.getComponent("EditText")?.name).toBe("TextField");
    expect(loader.getComponent("Input")?.name).toBe("TextField");
    expect(loader.getComponent("Check")?.name).toBe("CheckBox");
  });

  it("derives two-way binding for TextField.text and read-only for Label.text", () => {
    expect(loader.getComponent("TextField")!.bindingBehavior.text).toEqual({
      direction: "two-way",
    });
    expect(loader.getComponent("Label")!.bindingBehavior.text).toEqual({
      direction: "read-only",
    });
  });

  it("gives every component a well-formed platform matrix and description", () => {
    for (const name of loader.listComponents()) {
      const comp = loader.getComponent(name)!;
      expect(Object.keys(comp.platforms).sort()).toEqual([
        "kotlin_dynamic",
        "kotlin_generated",
        "react",
        "swift_dynamic",
        "swift_generated",
      ]);
      for (const value of Object.values(comp.platforms)) {
        expect(typeof value).toBe("boolean");
      }
      expect(comp.description.length).toBeGreaterThan(0);
      expect(Array.isArray(comp.aliases)).toBe(true);
      expect(Array.isArray(comp.rules)).toBe(true);
    }
  });

  it("only emits valid binding directions", () => {
    for (const name of loader.listComponents()) {
      const comp = loader.getComponent(name)!;
      for (const behavior of Object.values(comp.bindingBehavior)) {
        expect(["two-way", "read-only"]).toContain(
          (behavior as { direction: string }).direction
        );
      }
    }
  });

  it("categorizes common attributes without losing any", () => {
    const withCommon = loader.getComponentWithCommon("View");
    const categories = withCommon.commonAttributes.categories;
    let total = 0;
    for (const attrs of Object.values(categories)) {
      total += Object.keys(attrs as Record<string, unknown>).length;
    }
    expect(total).toBe(loader.getDataSource().commonAttributeCount);
  });

  it("answers core attribute lookups", () => {
    expect(loader.getAttribute("width")).not.toBeNull();
    expect(loader.getAttribute("background")).not.toBeNull();
    expect(loader.getAttribute("onclick")).not.toBeNull();
    expect(loader.searchComponents("binding").length).toBeGreaterThan(0);
  });
});
