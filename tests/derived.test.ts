/**
 * Derived static content served by the MCP: common-attribute categorizer and
 * the platform convention constants. The constants are pinned via file
 * snapshots — any edit to MODIFIER_ORDER / BINDING_RULES / PLATFORM_MAPPING
 * must be intentional and reviewed via the snapshot diff.
 */
import { describe, expect, it } from "vitest";

import {
  BINDING_RULES,
  MODIFIER_ORDER,
  PLATFORM_MAPPING,
  categorizeCommonAttributes,
} from "../src/data/derived.js";

describe("categorizeCommonAttributes", () => {
  it("places known keys into their category", () => {
    const result = categorizeCommonAttributes({
      width: { type: "int" },
      padding: { type: "int" },
      background: { type: "string" },
      hidden: { type: "boolean" },
      onClick: { type: "binding" },
      alignTop: { type: "boolean" },
      onAppear: { type: "binding" },
      testId: { type: "string" },
      binding_group: { type: "string" },
    });
    expect(result.categories.sizing.width).toBeDefined();
    expect(result.categories.spacing.padding).toBeDefined();
    expect(result.categories.visual.background).toBeDefined();
    expect(result.categories.visibility.hidden).toBeDefined();
    expect(result.categories.interaction.onClick).toBeDefined();
    expect(result.categories.layout.alignTop).toBeDefined();
    expect(result.categories.lifecycle.onAppear).toBeDefined();
    expect(result.categories.accessibility.testId).toBeDefined();
    expect(result.categories.binding.binding_group).toBeDefined();
  });

  it("routes unknown keys to 'other'", () => {
    const result = categorizeCommonAttributes({ mysteryKnob: { type: "int" } });
    expect(result.categories.other.mysteryKnob).toBeDefined();
  });

  it("skips _-prefixed keys", () => {
    const result = categorizeCommonAttributes({
      _meta: { version: 1 },
      width: { type: "int" },
    });
    expect(result.categories.other).toBeUndefined();
    expect(Object.keys(result.categories)).toEqual(["sizing"]);
  });

  it("drops empty categories entirely", () => {
    const result = categorizeCommonAttributes({ width: { type: "int" } });
    expect(Object.keys(result.categories)).toEqual(["sizing"]);
  });

  it("returns the wrapper description and source", () => {
    const result = categorizeCommonAttributes({});
    expect(result.description).toContain("Common attributes");
    expect(result.source).toContain("attribute_definitions.json");
    expect(result.categories).toEqual({});
  });

  it("preserves attribute definitions verbatim", () => {
    const def = { type: ["string", "binding"], description: "w" };
    const result = categorizeCommonAttributes({ width: def });
    expect(result.categories.sizing.width).toBe(def);
  });
});

describe("derived constants (pinned)", () => {
  it("MODIFIER_ORDER covers exactly swift/kotlin/react", () => {
    expect(Object.keys(MODIFIER_ORDER).sort()).toEqual([
      "description",
      "kotlin",
      "react",
      "swift",
    ]);
    expect(MODIFIER_ORDER.swift.order.length).toBeGreaterThan(0);
    expect(MODIFIER_ORDER.swift.criticalRules.length).toBeGreaterThan(0);
    expect(MODIFIER_ORDER.kotlin.order.length).toBeGreaterThan(0);
  });

  it("BINDING_RULES defines both directions and the @{} syntax", () => {
    expect(BINDING_RULES.format.bindingExpression).toBe("@{propertyName}");
    expect(Object.keys(BINDING_RULES.directions).sort()).toEqual([
      "read-only",
      "two-way",
    ]);
  });

  it("PLATFORM_MAPPING has all three platforms for every plain value mapping", () => {
    for (const mapping of Object.values(PLATFORM_MAPPING.values)) {
      expect(Object.keys(mapping).sort()).toEqual(["kotlin", "react", "swift"]);
    }
    for (const mapping of Object.values(PLATFORM_MAPPING.textAlign)) {
      expect(Object.keys(mapping).sort()).toEqual(["kotlin", "react", "swift"]);
    }
  });

  it("MODIFIER_ORDER snapshot", () => {
    expect(MODIFIER_ORDER).toMatchSnapshot();
  });

  it("BINDING_RULES snapshot", () => {
    expect(BINDING_RULES).toMatchSnapshot();
  });

  it("PLATFORM_MAPPING snapshot", () => {
    expect(PLATFORM_MAPPING).toMatchSnapshot();
  });
});
