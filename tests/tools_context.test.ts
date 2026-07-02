/**
 * Group B tools (project context) — exercised against a tmp-dir fixture
 * project (jui.config.json + specs + layouts). No real project is touched.
 */
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ServerConfig } from "../src/config.js";
import { register as registerGetProjectConfig } from "../src/tools/context/get_project_config.js";
import { register as registerListScreenSpecs } from "../src/tools/context/list_screen_specs.js";
import { register as registerListComponentSpecs } from "../src/tools/context/list_component_specs.js";
import { register as registerListLayouts } from "../src/tools/context/list_layouts.js";
import { register as registerReadSpecFile } from "../src/tools/context/read_spec_file.js";
import { register as registerReadLayoutFile } from "../src/tools/context/read_layout_file.js";
import {
  cleanupTempDirs,
  createToolHarness,
  makeFixtureProject,
  makeTempDir,
  writeJson,
  type ToolHarness,
} from "./helpers.js";

let harness: ToolHarness;
let projectDir: string;

beforeEach(() => {
  delete process.env.JUI_PROJECT_DIR;
  projectDir = makeTempDir("project");
  makeFixtureProject(projectDir);

  harness = createToolHarness();
  const config = new ServerConfig();
  registerGetProjectConfig(harness.server, config);
  registerListScreenSpecs(harness.server, config);
  registerListComponentSpecs(harness.server, config);
  registerListLayouts(harness.server, config);
  registerReadSpecFile(harness.server, config);
  registerReadLayoutFile(harness.server, config);
});

afterEach(() => {
  delete process.env.JUI_PROJECT_DIR;
  cleanupTempDirs();
});

describe("get_project_config", () => {
  it("returns the resolved project dir and parsed config", async () => {
    const result = JSON.parse(
      await harness.call("get_project_config", { project_dir: projectDir })
    );
    expect(result.project_dir).toBe(projectDir);
    expect(result.config.project_name).toBe("ExampleApp");
    expect(result.config.layouts_directory).toBe("layouts");
  });

  it("honors JUI_PROJECT_DIR when project_dir is omitted", async () => {
    process.env.JUI_PROJECT_DIR = projectDir;
    // ServerConfig captures the env at construction time — build a fresh one.
    const envHarness = createToolHarness();
    registerGetProjectConfig(envHarness.server, new ServerConfig());
    const result = JSON.parse(await envHarness.call("get_project_config"));
    expect(result.project_dir).toBe(projectDir);
  });

  it("returns an Error text when no project dir is configured", async () => {
    const text = await harness.call("get_project_config");
    expect(text).toMatch(/^Error: No project directory specified/);
  });

  it("returns an Error text when jui.config.json is missing", async () => {
    const bare = makeTempDir("bare");
    const text = await harness.call("get_project_config", { project_dir: bare });
    expect(text).toMatch(/^Error: jui\.config\.json not found/);
  });

  it("returns an Error text for a nonexistent project dir", async () => {
    const text = await harness.call("get_project_config", {
      project_dir: join(projectDir, "nope"),
    });
    expect(text).toMatch(/^Error: Project directory does not exist/);
  });
});

describe("list_screen_specs", () => {
  it("lists *.spec.json with extracted metadata", async () => {
    const specs = JSON.parse(
      await harness.call("list_screen_specs", { project_dir: projectDir })
    );
    const login = specs.find((s: any) => s.file === "login.spec.json");
    expect(login).toEqual({
      file: "login.spec.json",
      name: "Login",
      displayName: "Login Screen",
      type: "screen_spec",
      layoutFile: "login",
    });
  });

  it("degrades gracefully for unparseable spec files", async () => {
    const specs = JSON.parse(
      await harness.call("list_screen_specs", { project_dir: projectDir })
    );
    const broken = specs.find((s: any) => s.file === "broken.spec.json");
    expect(broken).toEqual({
      file: "broken.spec.json",
      name: "broken",
      displayName: "",
      type: "unknown",
      layoutFile: null,
    });
  });

  it("reports a missing spec directory as a plain message", async () => {
    const proj = makeTempDir("no-specs");
    writeJson(join(proj, "jui.config.json"), {
      project_name: "Empty",
      spec_directory: "missing/specs",
    });
    const text = await harness.call("list_screen_specs", { project_dir: proj });
    expect(text).toContain("Spec directory not found");
  });
});

describe("list_component_specs", () => {
  it("lists *.component.json with name and category", async () => {
    const specs = JSON.parse(
      await harness.call("list_component_specs", { project_dir: projectDir })
    );
    expect(specs).toEqual([
      {
        file: "example_card.component.json",
        name: "ExampleCard",
        category: "card",
      },
    ]);
  });
});

describe("list_layouts", () => {
  it("lists .json files recursively with relative paths, skipping non-JSON", async () => {
    const files = JSON.parse(
      await harness.call("list_layouts", { project_dir: projectDir })
    );
    expect(files.sort()).toEqual(["Styles/common.json", "login.json"]);
  });
});

describe("read_spec_file", () => {
  it("reads a screen spec from spec_directory", async () => {
    const text = await harness.call("read_spec_file", {
      file: "login.spec.json",
      project_dir: projectDir,
    });
    expect(JSON.parse(text).metadata.name).toBe("Login");
  });

  it("routes *.component.json to component_spec_directory", async () => {
    const text = await harness.call("read_spec_file", {
      file: "example_card.component.json",
      project_dir: projectDir,
    });
    expect(JSON.parse(text).metadata.name).toBe("ExampleCard");
  });

  it("reports missing files with the resolved path", async () => {
    const text = await harness.call("read_spec_file", {
      file: "ghost.spec.json",
      project_dir: projectDir,
    });
    expect(text).toContain("File not found");
    expect(text).toContain("ghost.spec.json");
  });

  it("blocks ../ traversal out of the project", async () => {
    // spec_directory is 3 levels deep — 4 ".." segments escape the project.
    const text = await harness.call("read_spec_file", {
      file: "../../../../outside-secret.json",
      project_dir: projectDir,
    });
    expect(text).toMatch(/^Error: Path traversal detected/);
  });

  it("allows ../ segments that stay inside the project", async () => {
    const text = await harness.call("read_spec_file", {
      file: "../../components/json/example_card.component.json",
      project_dir: projectDir,
    });
    // Ends in .component.json so it resolves from component_spec_directory,
    // climbs to docs/, and lands back inside the project.
    expect(JSON.parse(text).metadata.name).toBe("ExampleCard");
  });
});

describe("read_layout_file", () => {
  it("reads a top-level layout", async () => {
    const text = await harness.call("read_layout_file", {
      file: "login.json",
      project_dir: projectDir,
    });
    expect(JSON.parse(text).id).toBe("login_root");
  });

  it("reads nested layouts via relative paths", async () => {
    const text = await harness.call("read_layout_file", {
      file: "Styles/common.json",
      project_dir: projectDir,
    });
    expect(JSON.parse(text).defaultFontColor).toBe("#333333");
  });

  it("blocks ../ traversal out of the project", async () => {
    const text = await harness.call("read_layout_file", {
      file: "../../../../etc/hosts",
      project_dir: projectDir,
    });
    expect(text).toMatch(/^Error: Path traversal detected/);
  });

  it("reports missing layouts as File not found", async () => {
    const text = await harness.call("read_layout_file", {
      file: "ghost.json",
      project_dir: projectDir,
    });
    expect(text).toContain("File not found");
  });
});
