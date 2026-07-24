/**
 * Group C (jui CLI), Group D (jsonui-doc CLI), and Group E (API discovery)
 * tool wrappers. child_process is mocked — tests pin the exact CLI argv each
 * tool builds and the JSON output contract each tool returns. No real jui or
 * jsonui-doc binary is ever invoked.
 */
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execFileMock = vi.hoisted(() => vi.fn());
vi.mock("child_process", () => ({ execFile: execFileMock }));
vi.mock("node:child_process", () => ({ execFile: execFileMock }));

import { ServerConfig } from "../src/config.js";
// Group C
import { register as registerJuiInit } from "../src/tools/jui/jui_init.js";
import { register as registerJuiGenerateProject } from "../src/tools/jui/jui_generate_project.js";
import { register as registerJuiGenerateScreen } from "../src/tools/jui/jui_generate_screen.js";
import { register as registerJuiGenerateConverter } from "../src/tools/jui/jui_generate_converter.js";
import { register as registerJuiBuild } from "../src/tools/jui/jui_build.js";
import { register as registerJuiVerify } from "../src/tools/jui/jui_verify.js";
import { register as registerJuiMigrateLayouts } from "../src/tools/jui/jui_migrate_layouts.js";
import { register as registerJuiSyncTool } from "../src/tools/jui/jui_sync_tool.js";
// Group D
import { register as registerDocInitSpec } from "../src/tools/doc/doc_init_spec.js";
import { register as registerDocInitComponent } from "../src/tools/doc/doc_init_component.js";
import { register as registerDocValidateSpec } from "../src/tools/doc/doc_validate_spec.js";
import { register as registerDocValidateComponent } from "../src/tools/doc/doc_validate_component.js";
import { register as registerDocGenerateSpec } from "../src/tools/doc/doc_generate_spec.js";
import { register as registerDocGenerateComponent } from "../src/tools/doc/doc_generate_component.js";
import { register as registerDocGenerateHtml } from "../src/tools/doc/doc_generate_html.js";
import { register as registerDocRulesInit } from "../src/tools/doc/doc_rules_init.js";
import { register as registerDocRulesShow } from "../src/tools/doc/doc_rules_show.js";
// Group E
import { register as registerListApiSpecs } from "../src/tools/api/list_api_specs.js";
import { register as registerListApiModels } from "../src/tools/api/list_api_models.js";
import { register as registerPreviewApiModelSync } from "../src/tools/api/preview_api_model_sync.js";

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
  registerJuiInit(harness.server, config);
  registerJuiGenerateProject(harness.server, config);
  registerJuiGenerateScreen(harness.server, config);
  registerJuiGenerateConverter(harness.server, config);
  registerJuiBuild(harness.server, config);
  registerJuiVerify(harness.server, config);
  registerJuiMigrateLayouts(harness.server, config);
  registerJuiSyncTool(harness.server, config);
  registerDocInitSpec(harness.server, config);
  registerDocInitComponent(harness.server, config);
  registerDocValidateSpec(harness.server, config);
  registerDocValidateComponent(harness.server, config);
  registerDocGenerateSpec(harness.server, config);
  registerDocGenerateComponent(harness.server, config);
  registerDocGenerateHtml(harness.server, config);
  registerDocRulesInit(harness.server, config);
  registerDocRulesShow(harness.server, config);
  registerListApiSpecs(harness.server, config);
  registerListApiModels(harness.server, config);
  registerPreviewApiModelSync(harness.server, config);
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

// ----- Group C: jui CLI -----------------------------------------------------

describe("jui_build", () => {
  it("runs `jui build` in the project dir with a 300s timeout", async () => {
    nextResponse = { stdout: "built" };
    const text = await harness.call("jui_build", { project_dir: projectDir });
    expect(recorded).toEqual([
      expect.objectContaining({
        command: "jui",
        args: ["build"],
        options: expect.objectContaining({ cwd: projectDir, timeout: 300_000 }),
      }),
    ]);
    expect(JSON.parse(text)).toEqual({ success: true, output: "built" });
  });

  it("maps clean + platform params to CLI flags", async () => {
    await harness.call("jui_build", {
      clean: true,
      platform: "ios",
      project_dir: projectDir,
    });
    expect(recorded[0].args).toEqual(["build", "--clean", "--ios-only"]);

    await harness.call("jui_build", { platform: "android", project_dir: projectDir });
    expect(recorded[1].args).toEqual(["build", "--android-only"]);

    await harness.call("jui_build", { platform: "web", project_dir: projectDir });
    expect(recorded[2].args).toEqual(["build", "--web-only"]);
  });

  it("reports CLI failure via the formatResult contract", async () => {
    failWithCode(1, "log output", "build failed");
    const parsed = JSON.parse(
      await harness.call("jui_build", { project_dir: projectDir })
    );
    expect(parsed).toEqual({
      success: false,
      output: "log output",
      errors: "build failed",
    });
  });

  it("does not spawn anything when no project dir is configured", async () => {
    const text = await harness.call("jui_build");
    expect(text).toMatch(/^Error: No project directory specified/);
    expect(execFileMock).not.toHaveBeenCalled();
  });
});

describe("jui_init", () => {
  it("builds the full init argv from params", async () => {
    await harness.call("jui_init", {
      project_name: "ExampleApp",
      ios_path: "ios",
      ios_mode: "swiftui",
      android_path: "android",
      android_mode: "compose",
      package_name: "com.example.app",
      web_path: "web",
      project_dir: projectDir,
    });
    expect(recorded[0].command).toBe("jui");
    expect(recorded[0].args).toEqual([
      "init",
      "--project-name",
      "ExampleApp",
      "--ios",
      "ios",
      "--ios-mode",
      "swiftui",
      "--android",
      "android",
      "--android-mode",
      "compose",
      "--package-name",
      "com.example.app",
      "--web",
      "web",
    ]);
  });
});

describe("jui_generate_project", () => {
  it("maps spec_file / force / skip_layout / dry_run / platform flags", async () => {
    await harness.call("jui_generate_project", {
      spec_file: "login.spec.json",
      force: true,
      skip_layout: true,
      dry_run: true,
      platform: "web",
      project_dir: projectDir,
    });
    expect(recorded[0].args).toEqual([
      "generate",
      "project",
      "--file",
      "login.spec.json",
      "--force",
      "--skip-layout",
      "--dry-run",
      "--web-only",
    ]);
    expect(recorded[0].options.timeout).toBe(120_000);
  });
});

describe("jui_generate_screen", () => {
  it("passes all screen names positionally", async () => {
    await harness.call("jui_generate_screen", {
      names: ["LoginScreen", "RegisterScreen"],
      project_dir: projectDir,
    });
    expect(recorded[0].args).toEqual([
      "generate",
      "screen",
      "LoginScreen",
      "RegisterScreen",
    ]);
  });

  it("appends --display-name for a single screen", async () => {
    await harness.call("jui_generate_screen", {
      names: ["LoginScreen"],
      display_name: "Login",
      project_dir: projectDir,
    });
    expect(recorded[0].args).toEqual([
      "generate",
      "screen",
      "LoginScreen",
      "--display-name",
      "Login",
    ]);
  });
});

describe("jui_generate_converter", () => {
  it("maps direct-mode params to flags", async () => {
    await harness.call("jui_generate_converter", {
      name: "ExampleCard",
      attributes: "title:String,count:Int",
      container: true,
      skip_existing: true,
      project_dir: projectDir,
    });
    expect(recorded[0].args).toEqual([
      "generate",
      "converter",
      "ExampleCard",
      "--attributes",
      "title:String,count:Int",
      "--container",
      "--skip-existing",
    ]);
  });

  it("maps spec-mode params to flags", async () => {
    await harness.call("jui_generate_converter", {
      from_spec: "docs/components/json/example_card.component.json",
      all: true,
      project_dir: projectDir,
    });
    expect(recorded[0].args).toEqual([
      "generate",
      "converter",
      "--from",
      "docs/components/json/example_card.component.json",
      "--all",
    ]);
  });
});

describe("jui_verify", () => {
  it("reports no diffs on exit 0", async () => {
    nextResponse = { stdout: "all layouts match" };
    const parsed = JSON.parse(
      await harness.call("jui_verify", { project_dir: projectDir })
    );
    expect(parsed).toEqual({
      success: true,
      has_diffs: false,
      report: "all layouts match",
    });
  });

  it("reports has_diffs=true on non-zero exit and passes flags", async () => {
    failWithCode(1, "3 screens differ", "warning");
    const parsed = JSON.parse(
      await harness.call("jui_verify", {
        spec_file: "login.spec.json",
        detail: true,
        fail_on_diff: true,
        platform: "ios",
        project_dir: projectDir,
      })
    );
    expect(recorded[0].args).toEqual([
      "verify",
      "--file",
      "login.spec.json",
      "--detail",
      "--fail-on-diff",
      "--platform",
      "ios",
    ]);
    expect(parsed).toEqual({
      success: false,
      has_diffs: true,
      report: "3 screens differ",
      errors: "warning",
    });
  });
});

describe("jui_migrate_layouts", () => {
  it("maps source_platform and dry_run", async () => {
    await harness.call("jui_migrate_layouts", {
      source_platform: "android",
      dry_run: true,
      project_dir: projectDir,
    });
    expect(recorded[0].args).toEqual([
      "migrate-layouts",
      "--from",
      "android",
      "--dry-run",
    ]);
  });
});

describe("jui_sync_tool", () => {
  it("maps platform / prune / dry_run / from", async () => {
    await harness.call("jui_sync_tool", {
      platform: "web",
      prune: true,
      dry_run: true,
      from: "/opt/jsonui-cli",
      project_dir: projectDir,
    });
    expect(recorded[0].args).toEqual([
      "sync_tool",
      "--platform",
      "web",
      "--prune",
      "--dry-run",
      "--from",
      "/opt/jsonui-cli",
    ]);
  });
});

// ----- Group D: jsonui-doc CLI ----------------------------------------------

describe("doc_validate_spec", () => {
  it("resolves a bare filename into spec_directory from jui.config.json", async () => {
    await harness.call("doc_validate_spec", {
      file: "login.spec.json",
      project_dir: projectDir,
    });
    expect(recorded[0].command).toBe("jsonui-doc");
    expect(recorded[0].args).toEqual([
      "validate",
      "spec",
      join(projectDir, "docs/screens/json", "login.spec.json"),
    ]);
    expect(recorded[0].options.cwd).toBe(projectDir);
  });

  it("leaves paths containing a separator untouched", async () => {
    await harness.call("doc_validate_spec", {
      file: "custom/dir/login.spec.json",
      project_dir: projectDir,
    });
    expect(recorded[0].args[2]).toBe("custom/dir/login.spec.json");
  });

  it("falls back to the project root when jui.config.json is unreadable", async () => {
    const bare = makeTempDir("bare-project");
    await harness.call("doc_validate_spec", {
      file: "login.spec.json",
      project_dir: bare,
    });
    expect(recorded[0].args[2]).toBe(join(bare, "login.spec.json"));
  });

  it("maps exit code to success/is_valid", async () => {
    failWithCode(1, "2 errors found", "invalid enum value");
    const parsed = JSON.parse(
      await harness.call("doc_validate_spec", {
        file: "login.spec.json",
        project_dir: projectDir,
      })
    );
    expect(parsed).toEqual({
      success: false,
      is_valid: false,
      output: "2 errors found",
      errors: "invalid enum value",
    });
  });

  it("reports is_valid=true on exit 0", async () => {
    nextResponse = { stdout: "Valid!" };
    const parsed = JSON.parse(
      await harness.call("doc_validate_spec", {
        file: "login.spec.json",
        project_dir: projectDir,
      })
    );
    expect(parsed.success).toBe(true);
    expect(parsed.is_valid).toBe(true);
  });
});

describe("doc_validate_component", () => {
  it("resolves a bare filename into component_spec_directory", async () => {
    await harness.call("doc_validate_component", {
      file: "example_card.component.json",
      project_dir: projectDir,
    });
    expect(recorded[0].args).toEqual([
      "validate",
      "component",
      join(projectDir, "docs/components/json", "example_card.component.json"),
    ]);
  });
});

describe("doc_generate_spec", () => {
  it("resolves bare filenames and maps output/format flags", async () => {
    await harness.call("doc_generate_spec", {
      file: "login.spec.json",
      output: "docs/screens/html",
      format: "markdown",
      project_dir: projectDir,
    });
    expect(recorded[0].args).toEqual([
      "generate",
      "spec",
      join(projectDir, "docs/screens/json", "login.spec.json"),
      "-o",
      "docs/screens/html",
      "--format",
      "markdown",
    ]);
  });
});

describe("doc_generate_component", () => {
  it("resolves bare filenames into component_spec_directory", async () => {
    await harness.call("doc_generate_component", {
      file: "example_card.component.json",
      project_dir: projectDir,
    });
    expect(recorded[0].args).toEqual([
      "generate",
      "component",
      join(projectDir, "docs/components/json", "example_card.component.json"),
    ]);
  });
});

describe("doc_generate_html", () => {
  it("maps input dir, output dir, and title", async () => {
    await harness.call("doc_generate_html", {
      input_dir: "tests/screens",
      output_dir: "docs/tests/html",
      title: "Example Test Docs",
      project_dir: projectDir,
    });
    expect(recorded[0].args).toEqual([
      "generate",
      "html",
      "tests/screens",
      "-o",
      "docs/tests/html",
      "-t",
      "Example Test Docs",
    ]);
  });

  it("maps apps, docs_dirs, figma_dir, layouts_dir, and with_checks to CLI flags", async () => {
    await harness.call("doc_generate_html", {
      input_dir: "tests",
      output_dir: "docs/html",
      title: "Whole Site",
      apps: ["user:docs/user", "admin:docs/admin"],
      docs_dirs: ["docs/backend", "docs/requirements"],
      figma_dir: "docs/figma",
      layouts_dir: "Layouts",
      with_checks: true,
      project_dir: projectDir,
    });
    expect(recorded[0].args).toEqual([
      "generate",
      "html",
      "tests",
      "-o",
      "docs/html",
      "-t",
      "Whole Site",
      "--app",
      "user:docs/user",
      "--app",
      "admin:docs/admin",
      "-d",
      "docs/backend",
      "-d",
      "docs/requirements",
      "-fig",
      "docs/figma",
      "--layouts-dir",
      "Layouts",
      "--with-checks",
    ]);
  });

  it("omits all optional multi-app flags when not provided", async () => {
    await harness.call("doc_generate_html", {
      input_dir: "tests",
      project_dir: projectDir,
    });
    expect(recorded[0].args).toEqual(["generate", "html", "tests"]);
  });
});

describe("doc_init_spec", () => {
  it("maps name, display name, output dir, and file path", async () => {
    await harness.call("doc_init_spec", {
      name: "LearnHelloWorld",
      display_name: "Hello World",
      output_dir: "docs/screens/json",
      file_path: "learn/hello-world.spec.json",
      project_dir: projectDir,
    });
    expect(recorded[0].args).toEqual([
      "init",
      "spec",
      "LearnHelloWorld",
      "-d",
      "Hello World",
      "-o",
      "docs/screens/json",
      "-f",
      "learn/hello-world.spec.json",
    ]);
  });
});

describe("doc_init_component", () => {
  it("maps name, display name, and category", async () => {
    await harness.call("doc_init_component", {
      name: "ExampleCard",
      display_name: "Example Card",
      category: "card",
      project_dir: projectDir,
    });
    expect(recorded[0].args).toEqual([
      "init",
      "component",
      "ExampleCard",
      "-d",
      "Example Card",
      "-c",
      "card",
    ]);
  });
});

describe("doc_rules_init / doc_rules_show", () => {
  it("doc_rules_init maps flutter and output dir", async () => {
    await harness.call("doc_rules_init", {
      flutter: true,
      output_dir: "config",
      project_dir: projectDir,
    });
    expect(recorded[0].args).toEqual(["rules", "init", "--flutter", "-o", "config"]);
  });

  it("doc_rules_show maps the search directory", async () => {
    await harness.call("doc_rules_show", {
      directory: "config",
      project_dir: projectDir,
    });
    expect(recorded[0].args).toEqual(["rules", "show", "-d", "config"]);
  });
});

// ----- Group E: API model discovery ------------------------------------------

describe("list_api_specs", () => {
  it("passes the CLI's JSON stdout through verbatim (trimmed)", async () => {
    nextResponse = { stdout: '{"specs":[{"file":"api.yaml"}]}\n' };
    const text = await harness.call("list_api_specs", { project_dir: projectDir });
    expect(recorded[0].args).toEqual(["ls", "api-specs", "--json"]);
    expect(text).toBe('{"specs":[{"file":"api.yaml"}]}');
  });

  it("surfaces stderr (then stdout, then a fallback) on failure", async () => {
    failWithCode(2, "", "api_directory not configured");
    expect(
      await harness.call("list_api_specs", { project_dir: projectDir })
    ).toBe("api_directory not configured");

    failWithCode(2, "some stdout", "");
    expect(
      await harness.call("list_api_specs", { project_dir: projectDir })
    ).toBe("some stdout");

    failWithCode(2, "", "");
    expect(
      await harness.call("list_api_specs", { project_dir: projectDir })
    ).toBe("jui ls api-specs failed");
  });
});

describe("list_api_models", () => {
  it("adds --platform when restricted", async () => {
    nextResponse = { stdout: '{"models":[]}' };
    const text = await harness.call("list_api_models", {
      platform: "ios",
      project_dir: projectDir,
    });
    expect(recorded[0].args).toEqual([
      "ls",
      "api-models",
      "--json",
      "--platform",
      "ios",
    ]);
    expect(text).toBe('{"models":[]}');
  });

  it("surfaces stderr on failure", async () => {
    failWithCode(1, "", "no swagger found");
    expect(
      await harness.call("list_api_models", { project_dir: projectDir })
    ).toBe("no swagger found");
  });
});

describe("preview_api_model_sync", () => {
  it("runs the dry-run generate and returns stdout even on halt (non-zero exit)", async () => {
    failWithCode(1, '{"halt":"oneOf without discriminator"}', "halted");
    const text = await harness.call("preview_api_model_sync", {
      platform: "web",
      project_dir: projectDir,
    });
    expect(recorded[0].args).toEqual([
      "g",
      "api",
      "--dry-run",
      "--json",
      "--platform",
      "web",
    ]);
    expect(text).toBe('{"halt":"oneOf without discriminator"}');
  });

  it("falls back to stderr, then a placeholder, when stdout is empty", async () => {
    failWithCode(1, "", "swagger parse error");
    expect(
      await harness.call("preview_api_model_sync", { project_dir: projectDir })
    ).toBe("swagger parse error");

    nextResponse = { stdout: "", stderr: "" };
    expect(
      await harness.call("preview_api_model_sync", { project_dir: projectDir })
    ).toBe("preview returned no output");
  });
});
