/**
 * Group F (jsonui-test CLI) tool wrappers. child_process is mocked — tests
 * pin the exact CLI argv each tool builds and the output contract each tool
 * returns. No real jsonui-test binary is ever invoked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execFileMock = vi.hoisted(() => vi.fn());
vi.mock("child_process", () => ({ execFile: execFileMock }));
vi.mock("node:child_process", () => ({ execFile: execFileMock }));

import { ServerConfig } from "../src/config.js";
// Group F
import { register as registerTestValidate } from "../src/tools/test/test_validate.js";
import { register as registerTestGenerateScreen } from "../src/tools/test/test_generate_screen.js";
import { register as registerTestGenerateFlow } from "../src/tools/test/test_generate_flow.js";
import { register as registerTestGenerateDescription } from "../src/tools/test/test_generate_description.js";
import { register as registerTestReport } from "../src/tools/test/test_report.js";
import { register as registerTestMockGenerate } from "../src/tools/test/test_mock_generate.js";
import { register as registerTestArtifactsPull } from "../src/tools/test/test_artifacts_pull.js";
import { register as registerTestArtifactsStatus } from "../src/tools/test/test_artifacts_status.js";

import {
  cleanupTempDirs,
  createToolHarness,
  makeFixtureProject,
  makeTempDir,
  type ToolHarness,
} from "./helpers.js";

type ExecCallback = (error: any, stdout: string, stderr: string) => void;

interface RecordedCall {
  command: string;
  args: string[];
  options: Record<string, any>;
}

let recorded: RecordedCall[];
let nextResponse: { error?: any; stdout?: string; stderr?: string };
let harness: ToolHarness;
let projectDir: string;

beforeEach(() => {
  delete process.env.JUI_PROJECT_DIR;
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

  projectDir = makeTempDir("project");
  makeFixtureProject(projectDir);

  harness = createToolHarness();
  const config = new ServerConfig();
  registerTestValidate(harness.server, config);
  registerTestGenerateScreen(harness.server, config);
  registerTestGenerateFlow(harness.server, config);
  registerTestGenerateDescription(harness.server, config);
  registerTestReport(harness.server, config);
  registerTestMockGenerate(harness.server, config);
  registerTestArtifactsPull(harness.server, config);
  registerTestArtifactsStatus(harness.server, config);
});

afterEach(() => {
  delete process.env.JUI_PROJECT_DIR;
  cleanupTempDirs();
});

function failWithCode(code: number, stdout = "", stderr = ""): void {
  nextResponse = {
    error: Object.assign(new Error(`exit ${code}`), { code }),
    stdout,
    stderr,
  };
}

describe("Group F registration", () => {
  it("registers all 8 jsonui-test tools", () => {
    expect([...harness.tools.keys()].sort()).toEqual(
      [
        "test_artifacts_pull",
        "test_artifacts_status",
        "test_generate_description",
        "test_generate_flow",
        "test_generate_screen",
        "test_mock_generate",
        "test_report",
        "test_validate",
      ].sort()
    );
  });
});

describe("test_artifacts_pull", () => {
  it("builds the full argv, runs in the project dir with a 180s timeout, and passes JSON stdout through verbatim", async () => {
    const payload =
      '{"outputDir":"/p/tests/artifacts","files":["/p/a.png"],"skipped":[]}';
    nextResponse = { stdout: payload };
    const text = await harness.call("test_artifacts_pull", {
      project_dir: projectDir,
      platform: "ios",
      xcresult: "/x/y.xcresult",
      clean: true,
    });
    expect(recorded).toEqual([
      expect.objectContaining({
        command: "jsonui-test",
        args: [
          "artifacts",
          "pull",
          "--json",
          "--platform",
          "ios",
          "--xcresult",
          "/x/y.xcresult",
          "--clean",
        ],
        options: expect.objectContaining({ cwd: projectDir, timeout: 180_000 }),
      }),
    ]);
    expect(text).toBe(payload);
    // The CLI JSON survives untouched — no wrapper envelope.
    expect(JSON.parse(text)).toEqual({
      outputDir: "/p/tests/artifacts",
      files: ["/p/a.png"],
      skipped: [],
    });
  });

  it("maps the serial flag (Android)", async () => {
    nextResponse = { stdout: "{}" };
    await harness.call("test_artifacts_pull", {
      project_dir: projectDir,
      platform: "android",
      serial: "emulator-5554",
    });
    expect(recorded[0].args).toEqual([
      "artifacts",
      "pull",
      "--json",
      "--platform",
      "android",
      "--serial",
      "emulator-5554",
    ]);
  });

  it("reports CLI failure via the formatResult contract", async () => {
    failWithCode(1, "partial log", "no xcresult found");
    const parsed = JSON.parse(
      await harness.call("test_artifacts_pull", { project_dir: projectDir })
    );
    expect(parsed).toEqual({
      success: false,
      output: "partial log",
      errors: "no xcresult found",
    });
  });

  it("falls back to formatResult when exit-0 stdout is not JSON", async () => {
    nextResponse = { stdout: "pulled 3 artifacts" };
    const parsed = JSON.parse(
      await harness.call("test_artifacts_pull", { project_dir: projectDir })
    );
    expect(parsed).toEqual({ success: true, output: "pulled 3 artifacts" });
  });

  it("does not spawn anything when no project dir is configured", async () => {
    const text = await harness.call("test_artifacts_pull");
    expect(text).toMatch(/^Error: /);
    expect(execFileMock).not.toHaveBeenCalled();
  });
});

describe("test_artifacts_status", () => {
  it("runs `jsonui-test artifacts status --json` and passes JSON stdout through verbatim", async () => {
    const payload =
      '{"outputDir":"/p/tests/artifacts","ios":{"xcresult":"latest"},"android":{"appId":"com.example"},"files":[]}';
    nextResponse = { stdout: `${payload}\n` };
    const text = await harness.call("test_artifacts_status", {
      project_dir: projectDir,
    });
    expect(recorded).toEqual([
      expect.objectContaining({
        command: "jsonui-test",
        args: ["artifacts", "status", "--json"],
        options: expect.objectContaining({ cwd: projectDir }),
      }),
    ]);
    expect(text).toBe(payload);
  });

  it("reports CLI failure via the formatResult contract", async () => {
    failWithCode(2, "", "artifacts not configured");
    const parsed = JSON.parse(
      await harness.call("test_artifacts_status", { project_dir: projectDir })
    );
    expect(parsed).toEqual({
      success: false,
      output: "",
      errors: "artifacts not configured",
    });
  });

  it("does not spawn anything when no project dir is configured", async () => {
    const text = await harness.call("test_artifacts_status");
    expect(text).toMatch(/^Error: /);
    expect(execFileMock).not.toHaveBeenCalled();
  });
});
