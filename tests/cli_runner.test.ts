/**
 * cli_runner — execFile wrapper. child_process is mocked; no real CLI runs,
 * except in "the child's stdin", which calls through to the real execFile.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const execFileMock = vi.hoisted(() => vi.fn());
vi.mock("child_process", () => ({ execFile: execFileMock }));
vi.mock("node:child_process", () => ({ execFile: execFileMock }));

import { runCli, formatResult, type CliResult } from "../src/cli_runner.js";

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
    expect(result).toEqual({
      exitCode: 1,
      stdout: "partial output",
      stderr: "Command timed out after 60s",
    });
  });

  it("reports custom timeouts in the timeout message", async () => {
    nextResponse = {
      error: Object.assign(new Error("killed"), { killed: true }),
    };
    const result = await runCli("jui", ["build"], { cwd: "/proj", timeout: 5_000 });
    expect(result.stderr).toBe("Command timed out after 5s");
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

describe("formatResult", () => {
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
