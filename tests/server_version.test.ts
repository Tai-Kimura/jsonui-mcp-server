/**
 * The server reports package.json's version, not a literal.
 *
 * Until 2.13.0 the McpServer was built with version "2.0.0" (a literal from
 * the initial commit), so every release told MCP clients it was 2.0.0.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { pathToFileURL } from "url";
import { afterEach, describe, expect, it } from "vitest";
import { packageVersion } from "../src/version.js";

const repoRoot = join(__dirname, "..");
const tmpDirs: string[] = [];

function fakeModuleUrl(pkg: unknown): string {
  // A root with package.json and a src/ one level down, like the real layout.
  const root = mkdtempSync(join(tmpdir(), "jui-version-"));
  tmpDirs.push(root);
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "package.json"), JSON.stringify(pkg));
  return pathToFileURL(join(root, "src", "version.js")).href;
}

afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

describe("server version", () => {
  it("is the repository's package.json version", () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
    expect(packageVersion()).toBe(pkg.version);
  });

  it("follows whatever package.json says (a literal could not)", () => {
    expect(packageVersion(fakeModuleUrl({ version: "9.8.7" }))).toBe("9.8.7");
    expect(packageVersion(fakeModuleUrl({ version: "0.0.1-rc.2" }))).toBe("0.0.1-rc.2");
  });

  it("refuses a package.json without a version", () => {
    expect(() => packageVersion(fakeModuleUrl({ name: "x" }))).toThrow(/no version/);
    expect(() => packageVersion(fakeModuleUrl({ version: "" }))).toThrow(/no version/);
  });

  it("is what index.ts hands McpServer — no version literal left there", () => {
    const src = readFileSync(join(repoRoot, "src", "index.ts"), "utf8");
    expect(src).toMatch(/new McpServer\(\{[^}]*version:\s*packageVersion\(\)/s);
    expect(src).not.toMatch(/version:\s*["'`]\d+\.\d+\.\d+/);
  });
});
