/**
 * Snapshot completeness — the structural guard against the "bundled but not
 * auto-fetched" trap. binding_semantics.json fell into it (diagnosed, fixed,
 * commented), then coverage.json fell into the very same hole. The root cause
 * was that nothing enforced the invariant; this suite is that enforcement.
 *
 * Three surfaces must agree about the set of jsonui-cli data files:
 *
 *   data/ (bundled)  ⊆  fetch-manifest FILES  ⊆  what SpecLoader reads
 *
 *   A. Every file bundled in data/ is in the auto-fetch manifest — otherwise
 *      it only ever refreshes by hand and silently goes stale.
 *   B. Every manifest entry is actually read AND reported by the SpecLoader —
 *      otherwise postinstall fetches dead weight nobody serves, or serves a
 *      file get_data_source cannot account for. Checked on both layers:
 *      the bundled fallback (data/<local>) and a synthetic jsonui-cli
 *      checkout laid out from the manifest's <remote> paths, so a drifting
 *      remote path is caught too.
 */
import { copyFileSync, mkdirSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import { basename, dirname, join, resolve } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SpecLoader, type DataSourceInfo } from "../src/spec_loader.js";
import { cleanupTempDirs, makeTempDir } from "./helpers.js";
// Side-effect-free manifest module: importing it must never trigger a fetch.
import { FILES } from "../scripts/fetch-manifest.js";

interface ManifestEntry {
  remote: string;
  local: string;
  envOverride?: string;
}

const manifest = FILES as ManifestEntry[];
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const originalCwd = process.cwd();

/** Every file the loader read, as reported by get_data_source. */
function reportedFiles(source: DataSourceInfo) {
  return [
    source.attributeDefinitions,
    source.componentMetadata,
    source.screenIdentity,
    source.bindingSemantics,
    source.attributeSemantics,
    source.coverage,
  ].filter((f): f is NonNullable<typeof f> => f != null);
}

let bundledLoader: SpecLoader;
let cliLoader: SpecLoader;
let cliRoot: string;

beforeAll(() => {
  // Neutralize the env/cwd/home layers, then load once from this repo's
  // committed data/ snapshot (same harness as bundled_snapshot.test.ts).
  delete process.env.JSONUI_CLI_PATH;
  const home = makeTempDir("home");
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.chdir(makeTempDir("cwd"));
  bundledLoader = new SpecLoader(repoRoot);

  // Synthetic jsonui-cli checkout built FROM the manifest: each entry's
  // bundled snapshot copied to its <remote> path. Loading it through the env
  // layer (against an empty MCP root, so nothing can fall back) proves the
  // manifest's remote paths are exactly where the loader looks.
  cliRoot = makeTempDir("cli-checkout");
  for (const entry of manifest) {
    const target = join(cliRoot, entry.remote);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(repoRoot, "data", entry.local), target);
  }
  process.env.JSONUI_CLI_PATH = cliRoot;
  cliLoader = new SpecLoader(makeTempDir("empty-mcp-root"));
  delete process.env.JSONUI_CLI_PATH;
});

afterAll(() => {
  process.chdir(originalCwd);
  cleanupTempDirs();
});

describe("fetch manifest sanity", () => {
  it("has unique local filenames and unique remote paths", () => {
    const locals = manifest.map((f) => f.local);
    const remotes = manifest.map((f) => f.remote);
    expect(new Set(locals).size).toBe(locals.length);
    expect(new Set(remotes).size).toBe(remotes.length);
  });

  it("keeps local names in sync with their remote basenames", () => {
    for (const entry of manifest) {
      expect(
        basename(entry.remote),
        `${entry.local} is fetched from ${entry.remote} — renaming in flight invites confusion`
      ).toBe(entry.local);
    }
  });
});

describe("data/ ⊆ manifest (everything bundled is auto-fetched)", () => {
  it("lists every data/ file in the fetch manifest", () => {
    const fetched = new Set(manifest.map((f) => f.local));
    const bundled = readdirSync(join(repoRoot, "data")).filter(
      (name) => !name.startsWith(".") // .DS_Store and friends
    );
    expect(bundled.length).toBeGreaterThan(0);
    for (const file of bundled) {
      expect(
        fetched,
        `data/${file} is not in scripts/fetch-manifest.js FILES — ` +
          `it will only ever refresh by hand and silently go stale ` +
          `(the binding_semantics/coverage trap, third edition)`
      ).toContain(file);
    }
  });
});

describe("manifest ⊆ SpecLoader (everything fetched is read and reported)", () => {
  it("reads and reports every manifest file from the bundled layer", () => {
    const reported = reportedFiles(bundledLoader.getDataSource());
    for (const file of reported) {
      expect(file.layer).toBe("bundled");
    }
    const reportedNames = reported.map((f) => basename(f.path));
    for (const entry of manifest) {
      expect(
        reportedNames,
        `${entry.local} is fetched into data/ but the SpecLoader never read it ` +
          `(or does not report it via get_data_source)`
      ).toContain(entry.local);
    }
  });

  it("reads and reports every manifest file from a jsonui-cli checkout at its remote path", () => {
    const reported = reportedFiles(cliLoader.getDataSource());
    for (const file of reported) {
      expect(file.layer).toBe("env");
    }
    const reportedPaths = reported.map((f) => f.path);
    for (const entry of manifest) {
      expect(
        reportedPaths,
        `${entry.remote} is where postinstall fetches ${entry.local} from, but the ` +
          `SpecLoader resolves a different path inside a jsonui-cli checkout`
      ).toContain(join(cliRoot, entry.remote));
    }
  });
});
