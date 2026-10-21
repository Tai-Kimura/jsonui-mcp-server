/**
 * Group H (the server room's infra) tool wrappers. child_process is mocked and answers with what jsonui-doc itself
 * printed: tests/fixtures/infra/*.json, recorded by scripts/record-infra-fixtures.sh from jsonui-cli (RECORDED_FROM
 * names the commit). The summaries read named keys of those outputs, so they are the CLI's contract: record again
 * after the CLI's --json changes, and what no longer holds is red here. A key the tool needs and the output lacks is
 * named in the tool's answer, never summarised as an empty room.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execFileMock = vi.hoisted(() => vi.fn());
vi.mock("child_process", () => ({ execFile: execFileMock }));
vi.mock("node:child_process", () => ({ execFile: execFileMock }));

import { ServerConfig } from "../src/config.js";
import { register as registerInfraValidate } from "../src/tools/infra/infra_validate.js";
import { register as registerInfraLoadValidate } from "../src/tools/infra/infra_load_validate.js";
import { register as registerInfraPricesValidate } from "../src/tools/infra/infra_prices_validate.js";
import { register as registerInfraSeed } from "../src/tools/infra/infra_seed.js";
import { register as registerInfraCheck } from "../src/tools/infra/infra_check.js";
import { register as registerInfraCost } from "../src/tools/infra/infra_cost.js";
import { cleanupTempDirs, createToolHarness, makeFixtureProject, makeTempDir, type ToolHarness } from "./helpers.js";

const FIX = join(__dirname, "fixtures", "infra");
const raw = (name: string) => readFileSync(join(FIX, name), "utf-8");
const fixture = (name: string) => JSON.parse(raw(name));

type ExecCallback = (error: any, stdout: string, stderr: string) => void;
interface Answer { code?: number; stdout?: string; stderr?: string; seed?: boolean }

let calls: { command: string; args: string[]; options: any }[];
let answer: Answer;
let harness: ToolHarness;
let projectDir: string;

beforeEach(() => {
  delete process.env.JUI_PROJECT_DIR;
  calls = [];
  answer = {};
  execFileMock.mockReset();
  execFileMock.mockImplementation((command: string, args: string[], options: any, callback: ExecCallback) => {
    calls.push({ command, args, options });
    if (answer.seed) {           // seed writes its two files where -o says, as the CLI does
      const out = args[args.indexOf("-o") + 1];
      mkdirSync(out, { recursive: true });
      copyFileSync(join(FIX, "seed-infra.draft.json"), join(out, "draft.json"));
      copyFileSync(join(FIX, "seed-infra.report.json"), join(out, "seed-report.json"));
    }
    const error = answer.code ? Object.assign(new Error(`exit ${answer.code}`), { code: answer.code }) : null;
    callback(error, answer.stdout ?? "", answer.stderr ?? "");
    return { stdin: { end() {} } };
  });
  projectDir = makeTempDir("infra");
  makeFixtureProject(projectDir);
  harness = createToolHarness();
  const config = new ServerConfig();
  for (const register of [registerInfraValidate, registerInfraLoadValidate, registerInfraPricesValidate,
    registerInfraSeed, registerInfraCheck, registerInfraCost]) register(harness.server, config);
});

afterEach(() => {
  delete process.env.JUI_PROJECT_DIR;
  cleanupTempDirs();
});

const call = async (name: string, params: Record<string, unknown> = {}) =>
  JSON.parse(await harness.call(name, { project_dir: projectDir, ...params }));

/** The recorded output with one key taken out (at a dotted path). */
function without(name: string, path: string): string {
  const data = fixture(name);
  const keys = path.split(".");
  let at = data;
  for (const k of keys.slice(0, -1)) at = at[k];
  delete at[keys[keys.length - 1]];
  return JSON.stringify(data);
}

describe("the fixtures", () => {
  it("say which jsonui-cli printed them", () => {
    expect(raw("RECORDED_FROM")).toMatch(/^[0-9a-f]{7,} /);
  });
});

describe("infra_validate", () => {
  it("runs validate infra on the project and counts what the model holds", async () => {
    answer = { stdout: raw("validate-infra.ok.json") };
    const out = await call("infra_validate");
    expect(calls[0].command).toBe("jsonui-doc");
    expect(calls[0].args).toEqual(["validate", "infra", projectDir, "--json"]);
    expect(calls[0].options.cwd).toBe(projectDir);
    const rec = fixture("validate-infra.ok.json");
    expect(out).toMatchObject({ ok: true, exit: 0, readable: true, dir: rec.dir, files: rec.files, counts: rec.counts,
      environments: rec.environments.map((e: any) => e.id), flows: rec.flows.length });
    expect(out.problems).toEqual({ count: 0, errors: 0, warnings: 0, byCode: {}, first: [] });
  });

  it("an error is exit 1, counted by severity and code, its place and message kept", async () => {
    answer = { code: 1, stdout: raw("validate-infra.errors.json") };
    const out = await call("infra_validate");
    const [p] = fixture("validate-infra.errors.json").problems;
    expect(out.ok).toBe(false);
    expect(out.exit).toBe(1);
    expect(out.problems.errors).toBe(1);
    expect(out.problems.byCode).toEqual({ [p.code]: 1 });
    expect(out.problems.first).toEqual([{ severity: p.severity, code: p.code, file: p.file, path: p.path, message: p.message }]);
  });

  it("a room that cannot be read says why", async () => {
    answer = { code: 2, stdout: raw("validate-infra.unreadable.json") };
    const rec = fixture("validate-infra.unreadable.json");
    expect(await call("infra_validate")).toEqual({ ok: false, exit: 2, readable: false, reason: rec.reason, message: rec.message });
  });

  it("names a key the CLI's JSON lacks", async () => {
    answer = { stdout: without("validate-infra.ok.json", "problems") };
    expect(await harness.call("infra_validate", { project_dir: projectDir })).toMatch(/^Error: validate infra: the JSON has no "problems"/);
  });

  it("says so when the CLI prints no JSON (a jsonui-doc before --json)", async () => {
    answer = { code: 2, stdout: "", stderr: "jsonui-doc: error: unrecognized arguments: --json" };
    expect(await harness.call("infra_validate", { project_dir: projectDir }))
      .toMatch(/printed no JSON \(exit 2\): jsonui-doc: error: unrecognized arguments: --json — it needs jsonui-cli 2\.3\.15/);
  });
});

describe("infra_load_validate", () => {
  it("lists the scenarios as the CLI counts them", async () => {
    answer = { stdout: raw("validate-infra-load.ok.json") };
    const out = await call("infra_load_validate");
    expect(calls[0].args).toEqual(["validate", "infra-load", projectDir, "--json"]);
    const rec = fixture("validate-infra-load.ok.json");
    expect(out.scenarios).toEqual(rec.scenarios);
    expect(out).toMatchObject({ ok: true, exit: 0, dir: rec.dir, files: rec.files });
  });

  it("a file that is not JSON is an error with its line's place", async () => {
    answer = { code: 1, stdout: raw("validate-infra-load.errors.json") };
    const out = await call("infra_load_validate");
    expect(out.exit).toBe(1);
    expect(out.problems.first[0]).toMatchObject({ code: "json", file: "broken.json", severity: "error" });
    expect(out.scenarios.map((s: any) => s.id)).toEqual(fixture("validate-infra-load.errors.json").scenarios.map((s: any) => s.id));
  });

  it("no model is not readable, with the reason", async () => {
    answer = { code: 2, stdout: raw("validate-infra-load.unreadable.json") };
    expect(await call("infra_load_validate")).toMatchObject({ ok: false, readable: false, reason: "no_infra" });
  });

  it("names a scenario's key the CLI's JSON lacks", async () => {
    answer = { stdout: without("validate-infra-load.ok.json", "scenarios.0.hours") };
    expect(await harness.call("infra_load_validate", { project_dir: projectDir })).toMatch(/scenario: the JSON has no "hours"/);
  });
});

describe("infra_prices_validate", () => {
  it("counts the room's prices", async () => {
    answer = { stdout: raw("validate-infra-prices.ok.json") };
    const out = await call("infra_prices_validate");
    expect(calls[0].args).toEqual(["validate", "infra-prices", projectDir, "--json"]);
    expect(out).toMatchObject({ ok: true, count: fixture("validate-infra-prices.ok.json").count });
  });
});

describe("infra_seed", () => {
  it("drafts into a temp folder, reads it back and leaves the project as it was", async () => {
    answer = { seed: true };
    const out = await call("infra_seed");
    const args = calls[0].args;
    expect(args.slice(0, 4)).toEqual(["seed", "infra", projectDir, "-o"]);
    expect(args[4].startsWith(projectDir)).toBe(false);
    expect(existsSync(args[4])).toBe(false);                                 // the temp folder is gone
    expect(existsSync(join(projectDir, "docs/infra/seed"))).toBe(false);
    const draft = fixture("seed-infra.draft.json");
    const report = fixture("seed-infra.report.json");
    expect(out.written).toBeNull();
    expect(out.counts).toEqual({ nodes: draft.nodes.length, groups: draft.groups.length, edges: draft.edges.length, flows: 0 });
    expect(out.nodes.map((n: any) => n.id)).toEqual(draft.nodes.map((n: any) => n.id));
    expect(out.unmatched).toEqual(report.unmatched);
    expect(out.inputs).toEqual(report.inputs);
  });

  it("write: true writes <infra.dir>/seed, and force replaces", async () => {
    answer = { seed: true };
    const out = await call("infra_seed", { write: true, force: true });
    expect(calls[0].args).toEqual(["seed", "infra", projectDir, "-o", join(projectDir, "docs/infra", "seed"), "--force"]);
    expect(out.written).toBe(join(projectDir, "docs/infra", "seed"));
  });

  it("a refusal is its message", async () => {
    answer = { code: 2, stderr: "seed infra: docs/infra/seed already has a draft (--force to replace it)" };
    expect(await call("infra_seed", { write: true })).toEqual({ ok: false, exit: 2,
      message: "seed infra: docs/infra/seed already has a draft (--force to replace it)" });
  });
});

describe("infra_check", () => {
  it("runs check infra on the project and keeps each check's status and the results not ok", async () => {
    answer = { stdout: raw("check-infra.json") };
    const out = await call("infra_check");
    expect(calls[0].args).toEqual(["check", "infra", "-p", projectDir, "--json"]);
    const rec = fixture("check-infra.json");
    expect(out.ok).toBe(rec.ok);
    expect(out.checks.map((c: any) => [c.name, c.type, c.status])).toEqual(rec.checks.map((c: any) => [c.name, c.type, c.status]));
    expect(out.checks[0].results).toEqual(rec.checks[0].results.slice(0, 20));
    expect(out.checks[0].summary).toEqual(rec.checks[0].summary);
    expect(out.checks[0].report).toBe(rec.checks[0].report);
  });

  it("no infra check declared says how to declare one", async () => {
    answer = { code: 2, stdout: JSON.stringify({ ok: false, exit: 2, checks: [], declared: [] }),
      stderr: "No declared check matches 'infra'. Declared:" };
    expect(await call("infra_check")).toMatchObject({ ok: false, exit: 2, checks: [], message: "No declared check matches 'infra'. Declared:" });
  });

  it("names a check's key the CLI's JSON lacks", async () => {
    answer = { stdout: without("check-infra.json", "checks.0.summary") };
    expect(await harness.call("infra_check", { project_dir: projectDir })).toMatch(/check infra check: the JSON has no "summary"/);
  });
});

describe("infra_cost", () => {
  it("the month: the total, the totals by key adding up to it, the top nodes and what has no price", async () => {
    answer = { stdout: raw("cost-infra.month.json") };
    const out = await call("infra_cost");
    expect(calls[0].args).toEqual(["cost", "infra", projectDir, "--json"]);
    const rec = fixture("cost-infra.month.json");
    expect(out.month.usd).toBe(rec.month.usd);
    expect(out.month.totals.map((t: any) => t.key)).toEqual(["aws"]);
    expect(out.month.totals.reduce((a: number, t: any) => a + t.usd, 0)).toBeCloseTo(rec.month.usd, 6);
    expect(out.month.days).toBe(rec.month.days.length);
    expect(out.month.noPrice).toEqual(rec.month.noPrice);
    expect(out.month.noRule).toEqual(rec.month.noRule);
    expect(out.month.notes).toEqual(rec.month.warnings.map((w: any) => w.message));
    expect(out.topNodes).toEqual(rec.topNodes);
    expect(out.scenarios.map((s: any) => s.id)).toEqual(["ordinary", "sale"]);
    expect(out.day).toBeUndefined();
  });

  it("by node and a scenario go to the CLI; the rest is one key", async () => {
    answer = { stdout: raw("cost-infra.month-by-node.json") };
    const out = await call("infra_cost", { scenario: "sale", by: "node" });
    expect(calls[0].args).toEqual(["cost", "infra", projectDir, "--json", "--scenario", "sale", "--by", "node"]);
    const rec = fixture("cost-infra.month-by-node.json");
    expect(out.scenario).toBe("sale");
    expect(new Set(out.month.totals.map((t: any) => t.key))).toEqual(
      new Set(rec.month.keys.map((k: any) => (k.key === "__others__" ? "others" : k.key))
        .filter((k: string) => rec.month.days.some((d: any) => (k === "others" ? "__others__" : k) in d.stack))));
  });

  it("a day: each top node's charge by meter, the price layer, the peak hour — not its 24 hours", async () => {
    answer = { stdout: raw("cost-infra.day.json") };
    const text = await harness.call("infra_cost", { project_dir: projectDir, date: "2026-11-03" });
    expect(calls[0].args).toEqual(["cost", "infra", projectDir, "--json", "--date", "2026-11-03"]);
    expect(text.length).toBeLessThan(raw("cost-infra.day.json").length / 10);
    const out = JSON.parse(text);
    const rec = fixture("cost-infra.day.json").day;
    expect(out.day.usd).toBe(rec.usd);
    expect(out.day.nodes.map((n: any) => n.node)).toEqual(rec.nodes.map((n: any) => n.node));
    const db = out.day.nodes.find((n: any) => n.node === "db-prod");
    const recDb = rec.nodes.find((n: any) => n.node === "db-prod");
    const meterSum = Object.values(db.meters).reduce((a: number, m: any) => a + m.usd, 0);
    expect(meterSum).toBeCloseTo(recDb.usd, 6);
    expect(db.meters.instance).toMatchObject({ sku: "db.r6g.large:multi-az", layer: "bundled" });
    expect(out.month).toBeUndefined();
  });

  it("a scenario that is not there is refused with the reason", async () => {
    answer = { code: 2, stdout: raw("cost-infra.refused.json") };
    const rec = fixture("cost-infra.refused.json");
    expect(await call("infra_cost", { scenario: "nope" })).toEqual({ ok: false, exit: 2, reason: rec.reason, message: rec.message });
  });

  it("a date that is not YYYY-MM-DD never reaches the CLI", async () => {
    await expect(harness.call("infra_cost", { project_dir: projectDir, date: "11/03" })).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  it("names a key the month lacks", async () => {
    answer = { stdout: without("cost-infra.month.json", "month.noPrice") };
    expect(await harness.call("infra_cost", { project_dir: projectDir })).toMatch(/cost infra month: the JSON has no "noPrice"/);
  });
});

describe("each tool names a key its summary reads and the CLI's JSON lacks", () => {
  const cases: [string, Record<string, unknown>, string, string, RegExp][] = [
    ["infra_validate", {}, "validate-infra.ok.json", "dir", /validate infra: the JSON has no "dir"/],
    ["infra_load_validate", {}, "validate-infra-load.ok.json", "scenarios", /validate infra-load: the JSON has no "scenarios"/],
    ["infra_prices_validate", {}, "validate-infra-prices.ok.json", "count", /validate infra-prices: the JSON has no "count"/],
    ["infra_check", {}, "check-infra.json", "checks.0.status", /check infra check: the JSON has no "status"/],
    ["infra_check", {}, "check-infra.json", "checks.0.name", /check infra check: the JSON has no "name"/],
    ["infra_cost", {}, "cost-infra.month.json", "topNodes", /cost infra: the JSON has no "topNodes"/],
    ["infra_cost", {}, "cost-infra.month.json", "prices.warningCount", /cost infra prices: the JSON has no "warningCount"/],
    ["infra_cost", { date: "2026-11-03" }, "cost-infra.day.json", "day.nodes.0.hours", /cost infra day node: the JSON has no "hours"/],
  ];
  for (const [tool, params, file, path, message] of cases) {
    it(`${tool}: ${path}`, async () => {
      answer = { stdout: without(file, path) };
      expect(await harness.call(tool, { project_dir: projectDir, ...params })).toMatch(message);
    });
  }

  it("infra_seed: the report's unmatched", async () => {
    answer = { seed: true };
    const report = fixture("seed-infra.report.json");
    delete report.unmatched;
    execFileMock.mockImplementationOnce((command: string, args: string[], options: any, callback: ExecCallback) => {
      const out = args[args.indexOf("-o") + 1];
      mkdirSync(out, { recursive: true });
      copyFileSync(join(FIX, "seed-infra.draft.json"), join(out, "draft.json"));
      writeFileSync(join(out, "seed-report.json"), JSON.stringify(report));
      callback(null, "", "");
      return { stdin: { end() {} } };
    });
    expect(await harness.call("infra_seed", { project_dir: projectDir })).toMatch(/seed infra report: the JSON has no "unmatched"/);
  });
});

describe("a long problem list", () => {
  it("is counted whole and its first 20 kept", async () => {
    const data = fixture("validate-infra.errors.json");
    const [p] = data.problems;
    data.problems = Array.from({ length: 25 }, (_, i) => ({ ...p, path: `/nodes/${i}/category` }));
    answer = { code: 1, stdout: JSON.stringify(data) };
    const out = await call("infra_validate");
    expect(out.problems.count).toBe(25);
    expect(out.problems.errors).toBe(25);
    expect(out.problems.first).toHaveLength(20);
    expect(out.problems.first[19].path).toBe("/nodes/19/category");
  });
});
