/**
 * Group G (jui viz) tool wrappers. child_process is mocked: the tests pin the
 * argv each tool builds, that it runs in the home folder (never the project
 * dir), the envelope it returns, and the update hint for a jui that predates
 * viz / start / --with-relay. The stderr samples are what those jui versions
 * print, copied from real runs (2026-10-18), not written from memory.
 */
import { homedir } from "os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execFileMock = vi.hoisted(() => vi.fn());
vi.mock("child_process", () => ({ execFile: execFileMock }));
vi.mock("node:child_process", () => ({ execFile: execFileMock }));

import { register as registerVizStatus } from "../src/tools/viz/viz_status.js";
import { register as registerVizDoctor } from "../src/tools/viz/viz_doctor.js";
import { register as registerVizStart } from "../src/tools/viz/viz_start.js";
import { register as registerVizStop } from "../src/tools/viz/viz_stop.js";
import { register as registerVizOpen } from "../src/tools/viz/viz_open.js";
import { cleanupTempDirs, createToolHarness, makeTempDir, type ToolHarness } from "./helpers.js";

type ExecCallback = (error: any, stdout: string, stderr: string) => void;

let recorded: { command: string; args: string[]; options: Record<string, any> }[];
let nextResponse: { error?: any; stdout?: string; stderr?: string };
let harness: ToolHarness;

const VIZ_TOOLS = ["viz_status", "viz_doctor", "viz_start", "viz_stop", "viz_open"];

// jui 1.9.37 (no viz at all)
const NO_VIZ =
  "usage: jui [-h] [--version]\n" +
  "           {init,i,generate,g,build,b,verify,migrate-layouts,lint-generated,lint-strings,ls,sync_tool,hotload,conformance,screens} ...\n" +
  "jui: error: argument command: invalid choice: 'viz' (choose from init, i, generate, g, build, b, verify, migrate-layouts, lint-generated, lint-strings, ls, sync_tool, hotload, conformance, screens)\n";
// feature/jui-viz b69ac616 (viz, but no start)
const NO_START =
  "usage: jui viz [-h]\n" +
  "               {serve,status,stop,open,doctor,hooks,export-demo,relay} ...\n" +
  "jui viz: error: argument viz_cmd: invalid choice: 'start' (choose from serve, status, stop, open, doctor, hooks, export-demo, relay)\n";
// the same jui, asked for status --with-relay
const NO_WITH_RELAY =
  "usage: jui [-h] [--version]\n" +
  "           {init,i,generate,g,build,b,verify,migrate-layouts,lint-generated,lint-strings,ls,sync_tool,hotload,conformance,screens,viz} ...\n" +
  "jui: error: unrecognized arguments: --with-relay\n";

function failWithCode(code: number | string, stdout = "", stderr = ""): void {
  nextResponse = { error: Object.assign(new Error(`exit ${code}`), { code }), stdout, stderr };
}

beforeEach(() => {
  recorded = [];
  nextResponse = {};
  execFileMock.mockReset();
  execFileMock.mockImplementation((command: string, args: string[], options: any, callback: ExecCallback) => {
    recorded.push({ command, args, options });
    callback(nextResponse.error ?? null, nextResponse.stdout ?? "", nextResponse.stderr ?? "");
    return { stdin: { end() {} } };
  });
  harness = createToolHarness();
  registerVizStatus(harness.server);
  registerVizDoctor(harness.server);
  registerVizStart(harness.server);
  registerVizStop(harness.server);
  registerVizOpen(harness.server);
});

afterEach(() => {
  delete process.env.JUI_PROJECT_DIR;
  cleanupTempDirs();
});

describe("viz tools", () => {
  it("every description says only Claude Code sessions are shown", () => {
    expect([...harness.tools.keys()]).toEqual(VIZ_TOOLS);
    for (const name of VIZ_TOOLS) {
      expect(harness.tools.get(name)!.description).toContain("Claude Code のセッションだけを見せる");
    }
  });

  it.each([
    ["viz_status", {}, ["viz", "status", "--json", "--with-relay"]],
    ["viz_status", { relay: true }, ["viz", "status", "--json", "--with-relay"]],
    ["viz_status", { relay: false }, ["viz", "status", "--json"]],
    ["viz_doctor", {}, ["viz", "doctor", "--json"]],
    ["viz_start", {}, ["viz", "start", "--json"]],
    ["viz_start", { port: 18011 }, ["viz", "start", "--json", "--port", "18011"]],
    ["viz_stop", {}, ["viz", "stop"]],
    ["viz_open", {}, ["viz", "open"]],
  ])("%s %j runs jui %j in the home folder, not the project", async (tool, params, argv) => {
    process.env.JUI_PROJECT_DIR = makeTempDir("project");
    await harness.call(tool, params);
    expect(recorded).toHaveLength(1);
    expect(recorded[0].command).toBe("jui");
    expect(recorded[0].args).toEqual(argv);
    expect(recorded[0].options.cwd).toBe(homedir());
    expect(recorded[0].options.cwd).not.toBe(process.env.JUI_PROJECT_DIR);
  });

  it("viz_start waits longer than jui's own 15 s", async () => {
    await harness.call("viz_start");
    expect(recorded[0].options.timeout).toBeGreaterThan(15_000);
  });

  it("viz_start rejects a port outside 1-65535 before running anything", async () => {
    await expect(harness.call("viz_start", { port: 0 })).rejects.toThrow();
    await expect(harness.call("viz_start", { port: 70000 })).rejects.toThrow();
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("passes the CLI's JSON through as result", async () => {
    const started = { running: true, alreadyRunning: false, pid: 4242, url: "http://127.0.0.1:18011/", log: "/h/serve.log" };
    nextResponse = { stdout: JSON.stringify(started) + "\n" };
    expect(JSON.parse(await harness.call("viz_start"))).toEqual({ success: true, result: started });
  });

  it("a failed start keeps the CLI's JSON and reports failure, with no update hint", async () => {
    const failed = { running: false, error: "jui viz serve が終了しました（終了コード 1）", logTail: "ポート 18011 は使用中です" };
    failWithCode(1, JSON.stringify(failed));
    expect(JSON.parse(await harness.call("viz_start"))).toEqual({ success: false, result: failed });
  });

  it("a line that is not JSON comes back as output", async () => {
    nextResponse = { stdout: "jui viz: 止めました (pid 4242)\n" };
    expect(JSON.parse(await harness.call("viz_stop"))).toEqual({ success: true, output: "jui viz: 止めました (pid 4242)\n" });
  });

  it.each([
    ["viz_status", {}, NO_VIZ, "`jui viz`"],
    ["viz_start", {}, NO_VIZ, "`jui viz`"],
    ["viz_start", {}, NO_START, "`jui viz start`"],
    ["viz_status", {}, NO_WITH_RELAY, "`jui viz status --with-relay`"],
  ])("%s on an old jui names what is missing and how to update", async (tool, params, stderr, missing) => {
    failWithCode(2, "", stderr);
    const parsed = JSON.parse(await harness.call(tool, params));
    expect(parsed.success).toBe(false);
    expect(parsed.errors).toBe(stderr);
    expect(parsed.update_jui).toBe(
      `The installed jui has no ${missing}. Update jui, then call this tool again: ` +
        "curl -fsSL https://raw.githubusercontent.com/Tai-Kimura/jsonui-cli/main/installer/bootstrap.sh | bash"
    );
  });

  it("another argparse error is not taken for an old jui", async () => {
    failWithCode(2, "", "jui viz: error: argument --port: invalid int value: 'x'\n");
    expect(JSON.parse(await harness.call("viz_start")).update_jui).toBeUndefined();
  });

  it("no jui on PATH says so", async () => {
    failWithCode("ENOENT");
    const parsed = JSON.parse(await harness.call("viz_status"));
    expect(parsed.success).toBe(false);
    expect(parsed.update_jui).toMatch(/^jui is not installed \(not found on PATH\)\. Install it: curl /);
  });
});
