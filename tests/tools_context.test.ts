/**
 * Group B tools (project context) — exercised against a tmp-dir fixture
 * project (jui.config.json + specs + layouts). No real project is touched.
 */
import { symlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ServerConfig } from "../src/config.js";
import { register as registerGetProjectConfig } from "../src/tools/context/get_project_config.js";
import { register as registerListScreenSpecs } from "../src/tools/context/list_screen_specs.js";
import { register as registerListComponentSpecs } from "../src/tools/context/list_component_specs.js";
import { register as registerListLayouts } from "../src/tools/context/list_layouts.js";
import { register as registerReadSpecFile } from "../src/tools/context/read_spec_file.js";
import { register as registerReadLayoutFile } from "../src/tools/context/read_layout_file.js";
import { register as registerSearchSpecs } from "../src/tools/context/search_specs.js";
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
  registerSearchSpecs(harness.server, config);
});

/** A screen split across a parent spec + sub-spec files in a subdirectory. */
function writeSplitSpecFixture(root: string) {
  writeJson(join(root, "docs/screens/json/messages.spec.json"), {
    type: "screen_parent_spec",
    metadata: {
      name: "Messages",
      displayName: "Messages Screen",
      layoutFile: "messages",
    },
    subSpecs: [
      {
        file: "messages/messages-core.spec.json",
        name: "Messages - Core",
        description: "Core structure and message list",
      },
      {
        file: "messages/messages-composer.spec.json",
        name: "Messages - Composer",
        description: "Input area and attachments",
      },
    ],
  });
  writeJson(join(root, "docs/screens/json/messages/messages-core.spec.json"), {
    type: "screen_spec",
    metadata: { name: "Messages - Core" },
    structure: { messageList: { paging: true, currentPage: "@{currentPage}" } },
  });
  writeJson(
    join(root, "docs/screens/json/messages/messages-composer.spec.json"),
    {
      type: "screen_spec",
      metadata: { name: "Messages - Composer" },
      structure: { attachButton: { note: "opens the attachment sheet" } },
    }
  );
}

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

  it("expands a parent spec's subSpecs inline so the split is visible", async () => {
    writeSplitSpecFixture(projectDir);
    const specs = JSON.parse(
      await harness.call("list_screen_specs", { project_dir: projectDir })
    );
    const core = specs.find(
      (s: any) => s.file === "messages/messages-core.spec.json"
    );
    expect(core).toEqual({
      file: "messages/messages-core.spec.json",
      name: "Messages - Core",
      displayName: "Core structure and message list",
      type: "screen_sub_spec",
      parent: "messages.spec.json",
      layoutFile: "messages",
    });
    // The parent itself still lists normally.
    expect(
      specs.find((s: any) => s.file === "messages.spec.json")?.type
    ).toBe("screen_parent_spec");
  });
});

describe("search_specs", () => {
  it("finds a keyword inside a sub-spec file in a subdirectory", async () => {
    writeSplitSpecFixture(projectDir);
    const results = JSON.parse(
      await harness.call("search_specs", {
        query: "currentPage",
        project_dir: projectDir,
      })
    );
    const hit = results.find(
      (r: any) => r.file === "messages/messages-core.spec.json"
    );
    expect(hit).toBeTruthy();
    expect(hit.matches[0].path).toContain("structure.messageList");
    expect(hit.matches[0].snippet).toContain("@{currentPage}");
  });

  it("matches keys as well as string values, case-insensitively", async () => {
    writeSplitSpecFixture(projectDir);
    const results = JSON.parse(
      await harness.call("search_specs", {
        query: "ATTACHMENT",
        project_dir: projectDir,
      })
    );
    expect(
      results.some(
        (r: any) => r.file === "messages/messages-composer.spec.json"
      )
    ).toBe(true);
  });

  it("searches component specs too", async () => {
    const results = JSON.parse(
      await harness.call("search_specs", {
        query: "ExampleCard",
        project_dir: projectDir,
      })
    );
    expect(
      results.some((r: any) => r.file === "example_card.component.json")
    ).toBe(true);
  });

  it("reports no matches as a plain message", async () => {
    const text = await harness.call("search_specs", {
      query: "zzz_nothing_zzz",
      project_dir: projectDir,
    });
    expect(text).toContain("No matches");
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
    const paths = files
      .map((f: any) => (typeof f === "string" ? f : f.layout))
      .sort();
    expect(paths).toEqual(["Styles/common.json", "login.json"]);
  });

  it("never classifies a non-layout subtree, however jui resolves", async () => {
    const files = JSON.parse(
      await harness.call("list_layouts", { project_dir: projectDir })
    );
    const byPath = new Map<string, any>(
      files.map((f: any) => [typeof f === "string" ? f : f.layout, f])
    );

    // Holds whether or not `jui screens` is reachable: Styles/ is not a
    // layout tree (canon: screenId.nonLayoutSubtrees), and a style file
    // classified as a screen is how phantom screens got markers.
    expect(byPath.get("Styles/common.json")).toBe("Styles/common.json");

    // Classification comes from shelling out to `jui screens`, which is not
    // installed everywhere (CI runs without it). When it IS available the
    // shape is pinned; when it is not, the listing degrades to bare paths
    // and that is the documented fallback — so assert the branch we are in
    // rather than requiring the CLI.
    const login = byPath.get("login.json");
    if (typeof login === "string") {
      expect(login).toBe("login.json");
    } else {
      expect(login).toMatchObject({
        layout: "login.json",
        screen: "login",
        role: "screen",
        roleReason: "default",
      });
    }
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

  it("blocks reading through a symlink that escapes the project", async () => {
    const outside = makeTempDir("outside");
    writeFileSync(join(outside, "secret.json"), '{"leaked":true}');
    symlinkSync(outside, join(projectDir, "layouts", "external"));
    const text = await harness.call("read_layout_file", {
      file: "external/secret.json",
      project_dir: projectDir,
    });
    expect(text).toMatch(/^Error: Path traversal detected/);
    expect(text).not.toContain("leaked");
  });
});
