/**
 * ServerConfig — project dir resolution, jui.config.json reading,
 * directory field resolution, and path-traversal defense.
 */
import { join, resolve } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ServerConfig, type ProjectConfig } from "../src/config.js";
import {
  cleanupTempDirs,
  makeFixtureProject,
  makeTempDir,
  FIXTURE_PROJECT_CONFIG,
} from "./helpers.js";

beforeEach(() => {
  delete process.env.JUI_PROJECT_DIR;
});

afterEach(() => {
  delete process.env.JUI_PROJECT_DIR;
  cleanupTempDirs();
});

describe("resolveProjectDir", () => {
  it("uses the explicit override when given", () => {
    const dir = makeTempDir("proj");
    const config = new ServerConfig();
    expect(config.resolveProjectDir(dir)).toBe(resolve(dir));
  });

  it("falls back to JUI_PROJECT_DIR captured at construction time", () => {
    const dir = makeTempDir("proj");
    process.env.JUI_PROJECT_DIR = dir;
    const config = new ServerConfig();
    expect(config.resolveProjectDir()).toBe(resolve(dir));
  });

  it("prefers the override over JUI_PROJECT_DIR", () => {
    const envDir = makeTempDir("env-proj");
    const overrideDir = makeTempDir("override-proj");
    process.env.JUI_PROJECT_DIR = envDir;
    const config = new ServerConfig();
    expect(config.resolveProjectDir(overrideDir)).toBe(resolve(overrideDir));
  });

  it("throws a setup hint when neither override nor env is present", () => {
    const config = new ServerConfig();
    expect(() => config.resolveProjectDir()).toThrowError(
      /No project directory specified.*JUI_PROJECT_DIR/s
    );
  });

  it("throws when the directory does not exist", () => {
    const config = new ServerConfig();
    const missing = join(makeTempDir("base"), "does-not-exist");
    expect(() => config.resolveProjectDir(missing)).toThrowError(
      /Project directory does not exist/
    );
  });
});

describe("readProjectConfig", () => {
  it("parses jui.config.json from the project root", () => {
    const dir = makeTempDir("proj");
    makeFixtureProject(dir);
    const config = new ServerConfig();
    const project = config.readProjectConfig(dir);
    expect(project.project_name).toBe("ExampleApp");
    expect(project.spec_directory).toBe("docs/screens/json");
    expect(project.platforms.ios.mode).toBe("swiftui");
  });

  it("throws with a jui_init hint when jui.config.json is missing", () => {
    const dir = makeTempDir("empty-proj");
    const config = new ServerConfig();
    expect(() => config.readProjectConfig(dir)).toThrowError(
      /jui\.config\.json not found.*jui_init/s
    );
  });
});

describe("resolveDir", () => {
  const config = new ServerConfig();
  const projectConfig = FIXTURE_PROJECT_CONFIG as unknown as ProjectConfig;

  it("joins relative directory fields onto the project dir", () => {
    expect(resolveDirFor("layouts_directory")).toBe(join("/proj", "layouts"));
    expect(resolveDirFor("spec_directory")).toBe(
      join("/proj", "docs/screens/json")
    );
  });

  it("passes absolute directory fields through unchanged", () => {
    const absConfig = {
      ...projectConfig,
      layouts_directory: "/abs/layouts",
    } as ProjectConfig;
    expect(config.resolveDir(absConfig, "layouts_directory", "/proj")).toBe(
      "/abs/layouts"
    );
  });

  it("falls back to the project dir for non-string fields", () => {
    expect(config.resolveDir(projectConfig, "platforms", "/proj")).toBe("/proj");
  });

  function resolveDirFor(field: keyof ProjectConfig): string {
    return config.resolveDir(projectConfig, field, "/proj");
  }
});

describe("validatePathInProject", () => {
  const config = new ServerConfig();

  // Note: return values are asserted via suffix, not full equality — the
  // absolute prefix may be symlink-normalized (macOS /var -> /private/var).
  it("accepts a relative path inside the project", () => {
    const dir = makeTempDir("proj");
    const validated = config.validatePathInProject("layouts/login.json", dir);
    expect(validated.endsWith(join("layouts", "login.json"))).toBe(true);
  });

  it("accepts an absolute path inside the project", () => {
    const dir = makeTempDir("proj");
    const inside = join(dir, "docs", "spec.json");
    const validated = config.validatePathInProject(inside, dir);
    expect(validated.endsWith(join("docs", "spec.json"))).toBe(true);
  });

  it("rejects ../ traversal out of the project", () => {
    const dir = makeTempDir("proj");
    expect(() =>
      config.validatePathInProject("../../etc/passwd", dir)
    ).toThrowError(/Path traversal detected/);
  });

  it("rejects ../ traversal hidden in the middle of a path", () => {
    const dir = makeTempDir("proj");
    expect(() =>
      config.validatePathInProject("layouts/../../outside.json", dir)
    ).toThrowError(/Path traversal detected/);
  });

  it("rejects absolute paths outside the project", () => {
    const dir = makeTempDir("proj");
    const other = makeTempDir("other");
    expect(() =>
      config.validatePathInProject(join(other, "secret.json"), dir)
    ).toThrowError(/Path traversal detected/);
  });

  it("allows a path that stays inside after .. segments resolve", () => {
    const dir = makeTempDir("proj");
    const validated = config.validatePathInProject(
      "layouts/../docs/spec.json",
      dir
    );
    expect(validated.endsWith(join("docs", "spec.json"))).toBe(true);
    expect(validated).not.toContain("..");
  });
});
