import { readFileSync } from "fs";

/**
 * The version this server reports to MCP clients, read from package.json.
 *
 * The server used to hand McpServer a literal "2.0.0" — written in the
 * initial commit and never moved, so every release from 2.0.0 to 2.12.x
 * told clients it was 2.0.0. A literal beside a version that is bumped
 * elsewhere drifts silently; reading the one file the release bumps does
 * not.
 *
 * `../package.json` resolves from both places this module runs: src/ under
 * the test runner and dist/ at runtime (npm package and deploy checkout
 * alike keep package.json at the root, one level up).
 */
export function packageVersion(moduleUrl: string = import.meta.url): string {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", moduleUrl), "utf8"));
  if (typeof pkg.version !== "string" || pkg.version === "") {
    throw new Error("package.json has no version");
  }
  return pkg.version;
}
