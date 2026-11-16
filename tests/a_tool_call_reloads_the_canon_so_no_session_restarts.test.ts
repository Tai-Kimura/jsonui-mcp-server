/**
 * A jsonui-cli distribution replaces `~/.jsonui-cli` under every running MCP
 * server. Until 2.12.0 the remedy was "restart the MCP server" — in EVERY
 * session, after EVERY release (measured 2026-09-10: three running servers
 * at 2.10.3 while the distributed copy was 2.11.1). The user's word for it:
 * 面倒. So every tool call now asks `refreshIfChanged()` first; the check is
 * seven sha256s of small files, ~0.2 ms.
 *
 * The arms below are the three outcomes a call can meet, plus the one
 * structural claim ("every tool is wrapped") that a per-tool call would not
 * give: (1) content changed → the call serves the new content; (2) same
 * bytes, new mtime → nothing happens (a distribution moves every mtime);
 * (3) a half-written file → the previous content is kept and the failure is
 * reported, then the next call recovers once the file is whole.
 */
import { readFileSync, utimesSync, writeFileSync } from "fs";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installAutoReload } from "../src/auto_reload.js";
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

function attrPath(): string {
  return join(cliRoot, "shared", "core", "attribute_definitions.json");
}

/** One more component on disk than the fixture ships with. */
function addComponentOnDisk(): void {
  writeFileSync(
    attrPath(),
    JSON.stringify({ ...FIXTURE_ATTRIBUTE_DEFINITIONS, Extra: { foo: { type: "string" } } }, null, 2)
  );
}

function harnessWithDataSource() {
  const harness = createToolHarness();
  installAutoReload(harness.server, loader);
  registerDataSource(harness.server, loader);
  return harness;
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

describe("a tool call after the canon changed serves the new content", () => {
  it("the component added on disk is counted on the very next call", async () => {
    const harness = harnessWithDataSource();
    const before = JSON.parse(await harness.call("get_data_source"));
    addComponentOnDisk();
    const after = JSON.parse(await harness.call("get_data_source"));

    expect(after.componentCount).toBe(before.componentCount + 1);
    expect(loader.listComponents()).toContain("Extra");
    expect(after.lastReload.ok).toBe(true);
    expect(after.lastReload.changed).toContain(attrPath());
    // Nothing left to report: the reload consumed the difference.
    expect(after.staleInMemory).toBeUndefined();
    expect(after.loadedAt > before.loadedAt).toBe(true);
  });

  it("without the wrapper the same call serves the old content (陰性対照 on the mechanism)", async () => {
    const harness = createToolHarness();
    registerDataSource(harness.server, loader); // no installAutoReload
    const before = JSON.parse(await harness.call("get_data_source"));
    addComponentOnDisk();
    const after = JSON.parse(await harness.call("get_data_source"));
    expect(after.componentCount).toBe(before.componentCount);
    expect(after.staleInMemory).toContain(attrPath());
  });
});

describe("same bytes with a new mtime is not a change", () => {
  it("does not reload when only the timestamp moved", async () => {
    const harness = harnessWithDataSource();
    const before = JSON.parse(await harness.call("get_data_source"));
    const bytes = readFileSync(attrPath());
    writeFileSync(attrPath(), bytes);
    const future = new Date(Date.now() + 60_000);
    utimesSync(attrPath(), future, future);
    const after = JSON.parse(await harness.call("get_data_source"));
    expect(after.lastReload).toBeUndefined();
    expect(after.loadedAt).toBe(before.loadedAt);
  });
});

describe("a half-written file does not take the server down", () => {
  it("keeps the previous content, reports the failure, and recovers on the next whole write", async () => {
    const harness = harnessWithDataSource();
    const before = JSON.parse(await harness.call("get_data_source"));

    writeFileSync(attrPath(), '{"Button": {"text": {"ty'); // mid-copy
    const during = JSON.parse(await harness.call("get_data_source"));
    expect(during.componentCount).toBe(before.componentCount);
    expect(during.lastReload.ok).toBe(false);
    expect(during.lastReload.error).toMatch(/JSON/);
    expect(during.staleInMemory).toContain(attrPath());
    expect(during.hint).toMatch(/automatic reload did not replace it/);

    addComponentOnDisk();
    const after = JSON.parse(await harness.call("get_data_source"));
    expect(after.componentCount).toBe(before.componentCount + 1);
    expect(after.lastReload.ok).toBe(true);
    expect(after.staleInMemory).toBeUndefined();
  });
});

describe("every registered tool is wrapped, whatever overload registered it", () => {
  it("calls refreshIfChanged before each handler registered through the 4-arg form", async () => {
    const harness = createToolHarness();
    installAutoReload(harness.server, loader);
    const spy = vi.spyOn(loader, "refreshIfChanged");
    harness.server.tool("four", "d", {}, async () => ({ content: [{ type: "text" as const, text: "ok" }] }));
    expect(await harness.call("four")).toBe("ok");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("wraps the LAST function argument whatever the overload, so (name, schema, cb) is covered too", async () => {
    // The harness stores (name, description, schema, handler) positionally
    // and cannot represent the SDK's shorter overloads, so the wrapper is
    // checked here against a recorder: the registration must reach the
    // original with the handler REPLACED in the position it was given.
    const recorded: unknown[][] = [];
    const fake = { tool: (...args: unknown[]) => recorded.push(args) } as unknown as Parameters<typeof installAutoReload>[0];
    installAutoReload(fake, loader);
    const spy = vi.spyOn(loader, "refreshIfChanged");
    const handler = async () => "h";
    (fake as unknown as { tool: (...a: unknown[]) => unknown }).tool("three", {}, handler);
    (fake as unknown as { tool: (...a: unknown[]) => unknown }).tool("two", handler);

    expect(recorded[0][0]).toBe("three");
    expect(recorded[0][2]).not.toBe(handler);
    expect(recorded[1][1]).not.toBe(handler);
    await (recorded[0][2] as () => Promise<string>)();
    await (recorded[1][1] as () => Promise<string>)();
    expect(spy).toHaveBeenCalledTimes(2);
    // and the original handler still runs underneath
    expect(await (recorded[0][2] as () => Promise<string>)()).toBe("h");
  });

  it("the wrapper runs BEFORE the handler, not after (order is the point)", async () => {
    const harness = createToolHarness();
    installAutoReload(harness.server, loader);
    harness.server.tool("count", "d", {}, async () => ({
      content: [{ type: "text" as const, text: String(loader.getDataSource().componentCount) }],
    }));
    const before = Number(await harness.call("count"));
    addComponentOnDisk();
    expect(Number(await harness.call("count"))).toBe(before + 1);
  });
});
