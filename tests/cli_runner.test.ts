/**
 * cli_runner — execFile wrapper. child_process is mocked; no real CLI runs,
 * except in "the child's stdin", which calls through to the real execFile.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const execFileMock = vi.hoisted(() => vi.fn());
// execFileSync stays the real one: a timed-out run lists the child's
// descendants with `ps` (the real-process arms below).
vi.mock("child_process", async (importOriginal) => ({ ...(await importOriginal<any>()), execFile: execFileMock }));
vi.mock("node:child_process", async (importOriginal) => ({ ...(await importOriginal<any>()), execFile: execFileMock }));

import { runCli, formatResult, shellQuote, shellCommand, descendantPids, type CliResult } from "../src/cli_runner.js";
import { existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

type ExecCallback = (error: any, stdout: string, stderr: string) => void;

interface RecordedCall {
  command: string;
  args: string[];
  options: Record<string, any>;
}

let recorded: RecordedCall[];
let nextResponse: { error?: any; stdout?: string; stderr?: string };
// The mocked child's stdin: execFile returns a ChildProcess, and runCli ends
// its stdin.
let stdinEnd: ReturnType<typeof vi.fn>;

beforeEach(() => {
  recorded = [];
  nextResponse = {};
  stdinEnd = vi.fn();
  execFileMock.mockReset();
  execFileMock.mockImplementation(
    (command: string, args: string[], options: any, callback: ExecCallback) => {
      recorded.push({ command, args, options });
      callback(
        nextResponse.error ?? null,
        nextResponse.stdout ?? "",
        nextResponse.stderr ?? ""
      );
      return { stdin: { end: stdinEnd } };
    }
  );
});

describe("runCli", () => {
  it("returns exitCode 0 with stdout/stderr on success", async () => {
    nextResponse = { stdout: "done\n", stderr: "" };
    const result = await runCli("jui", ["build"], { cwd: "/proj" });
    expect(result).toEqual({ exitCode: 0, stdout: "done\n", stderr: "" });
  });

  it("propagates the process exit code from the error object", async () => {
    nextResponse = {
      error: Object.assign(new Error("exit 3"), { code: 3 }),
      stdout: "partial",
      stderr: "boom",
    };
    const result = await runCli("jui", ["verify"], { cwd: "/proj" });
    expect(result).toEqual({ exitCode: 3, stdout: "partial", stderr: "boom" });
  });

  it("defaults to exitCode 1 when the error has no code", async () => {
    nextResponse = { error: new Error("spawn failure") };
    const result = await runCli("jui", ["build"], { cwd: "/proj" });
    expect(result.exitCode).toBe(1);
  });

  it("maps a killed process to a timeout message using the default 60s", async () => {
    nextResponse = {
      error: Object.assign(new Error("killed"), { killed: true }),
      stdout: "partial output",
    };
    const result = await runCli("jui", ["build"], { cwd: "/proj" });
    expect(result).toMatchObject({ exitCode: 1, stdout: "partial output", timedOut: true });
    expect(result.stderr).toMatch(/^Command timed out after 60s and was stopped, with every process it started\./);
  });

  it("says a stopped run may leave its files half-updated, and names the shell command that finishes it", async () => {
    nextResponse = { error: Object.assign(new Error("killed"), { killed: true }) };
    const result = await runCli("jsonui-doc", ["generate", "html", "tests", "-o", "docs/html", "-t", "My Docs"], { cwd: "/my proj" });
    expect(result.stderr).toContain("half-updated");
    expect(result.rerunInShell).toBe("cd '/my proj' && jsonui-doc generate html tests -o docs/html -t 'My Docs'");
    expect(result.stderr).toContain(result.rerunInShell!);
  });

  it("reports custom timeouts in the timeout message", async () => {
    nextResponse = {
      error: Object.assign(new Error("killed"), { killed: true }),
    };
    const result = await runCli("jui", ["build"], { cwd: "/proj", timeout: 5_000 });
    expect(result.stderr).toMatch(/^Command timed out after 5s /);
  });

  it("forwards cwd / timeout / maxBuffer / UTF-8 env to execFile", async () => {
    await runCli("jsonui-doc", ["validate", "spec", "x.json"], {
      cwd: "/some/project",
      timeout: 12_345,
    });
    expect(recorded).toHaveLength(1);
    const { command, args, options } = recorded[0];
    expect(command).toBe("jsonui-doc");
    expect(args).toEqual(["validate", "spec", "x.json"]);
    expect(options.cwd).toBe("/some/project");
    expect(options.timeout).toBe(12_345);
    expect(options.maxBuffer).toBe(10 * 1024 * 1024);
    expect(options.env.PYTHONIOENCODING).toBe("utf-8");
  });

  it("uses a 60s timeout when none is given", async () => {
    await runCli("jui", ["build"], { cwd: "/proj" });
    expect(recorded[0].options.timeout).toBe(60_000);
  });
});

// execFile gives the child a stdin pipe, and through 2.13.1 nothing wrote to it
// or closed it: a CLI that read stdin — `sjui / kjui / rjui g converter` at
// its overwrite prompt, reached through `jui` — waited for a line that never
// came, until this runner's timeout killed it (60 s by default; measured
// 2026-09-26 on jsonui-cli, ticket
// generate-commands-overwrite-edited-files-and-ignore-their-flags). The
// child's stdin is ended at once: a reader sees end-of-file.
describe("the child's stdin", () => {
  it("is ended at once: a child that reads stdin to end-of-file finishes", async () => {
    const actual = await vi.importActual<typeof import("child_process")>("child_process");
    execFileMock.mockImplementation((...args: any[]) => (actual.execFile as any)(...args));
    const reader =
      "let n = 0; process.stdin.on('data', (c) => { n += c.length; });" +
      " process.stdin.on('end', () => { console.log('eof after ' + n + ' bytes'); });";
    const started = Date.now();
    // runCli's own limit is 5 s: a child left waiting on stdin comes back as
    // "Command timed out after 5s", and this test's limit (10 s) stops the
    // suite from waiting longer than that.
    const result = await runCli(process.execPath, ["-e", reader], { cwd: process.cwd(), timeout: 5_000 });
    const elapsed = Date.now() - started;
    expect(result.stderr).not.toMatch(/timed out/);
    expect(result).toMatchObject({ exitCode: 0, stdout: "eof after 0 bytes\n" });
    expect(elapsed).toBeLessThan(2_500);
  }, 10_000);

  it("ends the stdin of the process execFile returns", async () => {
    await runCli("jui", ["build"], { cwd: "/proj" });
    expect(stdinEnd).toHaveBeenCalledTimes(1);
  });
});

describe("shellQuote / shellCommand", () => {
  it("leaves a plain word as it is and single-quotes anything else", () => {
    expect(shellQuote("docs/html")).toBe("docs/html");
    expect(shellQuote("--app=admin:./a")).toBe("--app=admin:./a");
    expect(shellQuote("My Docs")).toBe("'My Docs'");
    expect(shellQuote("it's")).toBe(`'it'"'"'s'`);
    expect(shellQuote("")).toBe("''");
  });

  it("is a cd into the project, then the command", () => {
    expect(shellCommand("jui", ["build"], "/p")).toBe("cd /p && jui build");
  });
});

// Through 2.26.1 the limit was execFile's own, which signals the direct child
// only: `jui build` stopped while the kjui process it had started went on
// writing the project, reparented to PID 1 (measured 2026-11-15, ticket
// mcp-doc-generate-html-timeout-leaves-partial-output). The arm runs a real
// child that starts a grandchild writing a file after 1.5 s, and stops the run
// at 0.5 s: the file must never appear.
describe("a timed-out run (real processes)", () => {
  it.skipIf(process.platform === "win32")("stops every process the CLI started, not the CLI alone", async () => {
    const actual = await vi.importActual<typeof import("child_process")>("child_process");
    execFileMock.mockImplementation((...args: any[]) => (actual.execFile as any)(...args));
    const dir = mkdtempSync(join(tmpdir(), "cli-runner-group-"));
    const marker = join(dir, "written-after-the-stop");
    try {
      const grandchild = `setTimeout(() => require('fs').writeFileSync(${JSON.stringify(marker)}, 'x'), 1500)`;
      // The grandchild's output goes elsewhere (as a tool's subprocess with
      // its output captured): the CLI's own pipe closes when the CLI ends.
      const cli =
        `require('child_process').spawn(process.execPath, ['-e', ${JSON.stringify(grandchild)}], { stdio: 'ignore' });` +
        " setInterval(() => {}, 1000);";
      const result = await runCli(process.execPath, ["-e", cli], { cwd: dir, timeout: 500 });
      expect(result.timedOut).toBe(true);
      await new Promise((r) => setTimeout(r, 2_500));
      expect(existsSync(marker)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 10_000);

});

describe("descendantPids", () => {
  it.skipIf(process.platform === "win32")("finds a child's child, deepest first", async () => {
    const actual = await vi.importActual<typeof import("child_process")>("child_process");
    const grandchild = "setTimeout(() => {}, 3000)";
    const cli = `require('child_process').spawn(process.execPath, ['-e', ${JSON.stringify(grandchild)}], { stdio: 'ignore' }); setTimeout(() => {}, 3000)`;
    const child = actual.spawn(process.execPath, ["-e", cli], { stdio: "ignore" });
    try {
      await new Promise((r) => setTimeout(r, 500));
      const found = descendantPids(child.pid!);
      expect(found).toHaveLength(1);
      expect(descendantPids(process.pid)).toEqual(expect.arrayContaining([found[0], child.pid]));
      expect(descendantPids(process.pid).indexOf(found[0])).toBeLessThan(descendantPids(process.pid).indexOf(child.pid!));
    } finally {
      for (const p of descendantPids(child.pid!)) { try { process.kill(p); } catch {} }
      child.kill();
    }
  }, 10_000);
});

describe("formatResult", () => {
  it("carries a timeout's flag and its shell command", () => {
    const result: CliResult = { exitCode: 1, stdout: "", stderr: "Command timed out after 60s ...", timedOut: true, rerunInShell: "cd /p && jui build" };
    expect(JSON.parse(formatResult(result))).toEqual({
      success: false,
      output: "",
      errors: "Command timed out after 60s ...",
      timedOut: true,
      rerunInShell: "cd /p && jui build",
    });
  });

  it("marks exitCode 0 as success and omits empty errors", () => {
    const result: CliResult = { exitCode: 0, stdout: "ok", stderr: "" };
    const parsed = JSON.parse(formatResult(result));
    expect(parsed).toEqual({ success: true, output: "ok" });
    expect("errors" in parsed).toBe(false);
  });

  it("marks non-zero exit as failure and includes stderr", () => {
    const result: CliResult = { exitCode: 2, stdout: "log", stderr: "bad" };
    expect(JSON.parse(formatResult(result))).toEqual({
      success: false,
      output: "log",
      errors: "bad",
    });
  });
});
