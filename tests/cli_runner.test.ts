/**
 * cli_runner — execFile wrapper. child_process is mocked; no real CLI runs.
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

beforeEach(() => {
  recorded = [];
  nextResponse = {};
  execFileMock.mockReset();
  execFileMock.mockImplementation(
    (command: string, args: string[], options: any, callback: ExecCallback) => {
      recorded.push({ command, args, options });
      callback(
        nextResponse.error ?? null,
        nextResponse.stdout ?? "",
        nextResponse.stderr ?? ""
      );
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
