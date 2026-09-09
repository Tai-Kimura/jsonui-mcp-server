/**
 * `staleInMemory` answers "is what I hold still what is on disk" — and that is
 * a question about CONTENT.
 *
 * 🚨 WHY THIS FILE EXISTS. It used to compare mtimes. Every jsonui-cli
 * distribution replaces `~/.jsonui-cli` wholesale, so an install moves every
 * timestamp whether or not a byte changed. Measured 2026-09-09: a release
 * whose `shared/core` blobs were IDENTICAL to the previous release's moved all
 * seven, and three running servers then reported "restart it" while serving
 * exactly the right content. An alarm with a 100% fire rate cannot be a gate.
 *
 * The same toolchain had already reached this conclusion one repo over — the
 * `jui build` generation manifest records a sha256 and its docstring says why:
 * "a record that changes when nothing changed is noise, and noise is what gets
 * ignored". Two implementations of one rule; only one had read it.
 *
 * ⚠️ `freshness` and `staleInMemory` are DIFFERENT QUANTITIES: the first is
 * about the file (how old), the second about this process (what it holds). A
 * reader who checks only the first sees "fresh" on every file while the server
 * serves something else. One arm below pins that they can disagree.
 */
import { rmSync, statSync, utimesSync, writeFileSync } from "fs";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SpecLoader } from "../src/spec_loader.js";
import { register as registerDataSource } from "../src/tools/spec/get_data_source.js";
import {
  cleanupTempDirs,
  createToolHarness,
  makeCliDataset,
  makeTempDir,
  FIXTURE_ATTRIBUTE_DEFINITIONS,
  FIXTURE_COVERAGE,
} from "./helpers.js";

const originalCwd = process.cwd();
let cliRoot: string;
let loader: SpecLoader;

/** The file every arm here pokes at. */
function attrPath(): string {
  return join(cliRoot, "shared", "core", "attribute_definitions.json");
}

/** Rewrite a file with the SAME bytes, then move its mtime forward. */
function touchWithoutChanging(path: string): void {
  const bytes = require("fs").readFileSync(path);
  writeFileSync(path, bytes);
  const future = new Date(Date.now() + 60_000);
  utimesSync(path, future, future);
}

beforeEach(() => {
  cliRoot = makeTempDir("cli");
  makeCliDataset(cliRoot, { coverage: FIXTURE_COVERAGE });
  process.env.JSONUI_CLI_PATH = cliRoot;
  process.chdir(makeTempDir("cwd"));
  process.env.HOME = makeTempDir("home");
  process.env.USERPROFILE = process.env.HOME;
  loader = new SpecLoader(makeTempDir("mcp"));
});

afterEach(() => {
  delete process.env.JSONUI_CLI_PATH;
  process.chdir(originalCwd);
  cleanupTempDirs();
});

describe("a moved timestamp on identical bytes is not staleness", () => {
  it("reports nothing when nothing was touched", () => {
    expect(loader.getChangedSinceLoad()).toEqual([]);
  });

  it("reports nothing when the file is rewritten with the same bytes", () => {
    const before = statSync(attrPath()).mtime.toISOString();
    touchWithoutChanging(attrPath());
    // 陽性対照 ON THE FIXTURE: without this, an arm that passes because the
    // rewrite silently failed looks identical to one that passes correctly.
    expect(statSync(attrPath()).mtime.toISOString()).not.toBe(before);

    expect(loader.getChangedSinceLoad()).toEqual([]);
  });

  it("reports the file when the bytes actually change", () => {
    writeFileSync(
      attrPath(),
      JSON.stringify({ ...FIXTURE_ATTRIBUTE_DEFINITIONS, Extra: {} }, null, 2)
    );
    expect(loader.getChangedSinceLoad()).toContain(attrPath());
  });

  it("reports the file when it disappears", () => {
    // No hash can be computed, and the server is serving content whose source
    // is gone — the reader needs that, so absence counts as changed.
    rmSync(attrPath());
    expect(loader.getChangedSinceLoad()).toContain(attrPath());
  });

  it("does not report a sibling that was left alone", () => {
    // 陰性対照: an implementation that reported everything passes the two
    // positive arms above.
    writeFileSync(
      attrPath(),
      JSON.stringify({ ...FIXTURE_ATTRIBUTE_DEFINITIONS, Extra: {} }, null, 2)
    );
    const changed = loader.getChangedSinceLoad();
    expect(changed).toContain(attrPath());
    expect(changed.some((p) => p.endsWith("component_metadata.json"))).toBe(false);
  });
});

describe("freshness and staleInMemory are different quantities", () => {
  it("a file can be fresh on disk while the server holds something else", async () => {
    writeFileSync(
      attrPath(),
      JSON.stringify({ ...FIXTURE_ATTRIBUTE_DEFINITIONS, Extra: {} }, null, 2)
    );
    const harness = createToolHarness();
    registerDataSource(harness.server, loader);
    const out = JSON.parse(await harness.call("get_data_source"));

    // The file is minutes old, so freshness says "fresh" …
    expect(out.attributeDefinitions.freshness).toBe("fresh");
    // … and the server is still serving what it read before the edit.
    expect(out.staleInMemory).toContain(attrPath());
  });

  it("the hint says the comparison is by content, not by timestamp", async () => {
    writeFileSync(
      attrPath(),
      JSON.stringify({ ...FIXTURE_ATTRIBUTE_DEFINITIONS, Extra: {} }, null, 2)
    );
    const harness = createToolHarness();
    registerDataSource(harness.server, loader);
    const out = JSON.parse(await harness.call("get_data_source"));
    expect(out.hint).toContain("sha256");
  });

  it("says nothing when the server is current", async () => {
    // 陰性対照 for both arms above.
    const harness = createToolHarness();
    registerDataSource(harness.server, loader);
    const out = JSON.parse(await harness.call("get_data_source"));
    expect(out.staleInMemory).toBeUndefined();
  });
});

describe("the per-file report covers what the check tracks", () => {
  it("names every file that staleInMemory can name", async () => {
    // The two lists were 5 and 7. A reader who checked "every file reported"
    // had two outside their view — reported by a consumer lane 2026-09-09.
    const harness = createToolHarness();
    registerDataSource(harness.server, loader);
    const out = JSON.parse(await harness.call("get_data_source"));

    const reported = new Set(
      ["attributeDefinitions", "componentMetadata", "screenIdentity",
       "bindingSemantics", "attributeSemantics", "platformSemantics", "coverage"]
        .map((k) => out[k]?.path)
        .filter(Boolean)
    );
    // Every path the checker watches must appear in the per-file section.
    // Touch them all so the checker returns its full set.
    for (const p of reported) {
      writeFileSync(p as string, require("fs").readFileSync(p as string));
    }
    for (const p of loader.getChangedSinceLoad()) {
      expect(reported.has(p)).toBe(true);
    }
  });

  it("reports the coverage ledger, which the five-file version omitted", async () => {
    const harness = createToolHarness();
    registerDataSource(harness.server, loader);
    const out = JSON.parse(await harness.call("get_data_source"));
    expect(out.coverage?.path).toContain("coverage.json");
  });
});
