/**
 * The auto-fetch manifest: every file that `scripts/fetch-definitions.js`
 * refreshes into `data/` at npm install time.
 *
 * This lives in its own side-effect-free module so the test suite can import
 * the manifest without triggering a network fetch. The invariant it exists to
 * enforce (tests/snapshot_completeness.test.ts):
 *
 *   every file bundled in data/  ⊆  this manifest  ⊆  files SpecLoader reads
 *
 * A data/ file missing from the manifest only ever refreshes by hand and
 * silently goes stale (binding_semantics.json and coverage.json each fell
 * into exactly this trap). A manifest entry SpecLoader never reads is dead
 * weight fetched on every install. Adding a file here without wiring it into
 * spec_loader.ts (or vice versa) fails the suite.
 */

export const FILES = [
  {
    remote: "shared/core/attribute_definitions.json",
    local: "attribute_definitions.json",
    envOverride: process.env.JSONUI_ATTR_DEFINITIONS_URL,
  },
  {
    remote: "shared/core/component_metadata.json",
    local: "component_metadata.json",
    envOverride: process.env.JSONUI_COMPONENT_METADATA_URL,
  },
  // Canonical binding-resolution semantics. This was bundled in data/ but
  // missing from FILES, so the snapshot only ever refreshed by hand and
  // silently went stale — the same trap the screen-identity asset would
  // otherwise fall into.
  {
    remote: "shared/core/binding_semantics.json",
    local: "binding_semantics.json",
    envOverride: process.env.JSONUI_BINDING_SEMANTICS_URL,
  },
  // Canonical screen identity: what a screen is, how it is identified, how
  // its presence is asserted.
  {
    remote: "shared/core/screen_identity.json",
    local: "screen_identity.json",
    envOverride: process.env.JSONUI_SCREEN_IDENTITY_URL,
  },
  // Conformance coverage ledger (declared-but-unimplemented gaps). The loader
  // reads data/coverage.json as its fallback, so it must refresh with the rest
  // — binding_semantics.json already fell into this exact stale-snapshot trap.
  {
    remote: "conformance/coverage.json",
    local: "coverage.json",
    envOverride: process.env.JSONUI_COVERAGE_URL,
  },
];
