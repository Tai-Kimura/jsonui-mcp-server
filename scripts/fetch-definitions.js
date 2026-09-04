#!/usr/bin/env node
/**
 * Post-install hook: fetch the data files from the pinned jsonui-cli release
 * tag and write them into `data/`. These populate the 4th-layer fallback
 * in spec_loader.ts (the bundled snapshot).
 *
 * The list of files lives in ./fetch-manifest.js (side-effect-free, so the
 * test suite can assert its completeness without triggering a fetch).
 *
 * Users who install jsonui-cli separately will prefer that checkout via the
 * higher-priority fallback layers; users who don't have jsonui-cli installed
 * get a working MCP with the bundled snapshots.
 *
 * The fetch is best-effort. If the network is unavailable at install time
 * (CI sandbox, offline install, etc.) and no existing snapshot is present,
 * the script exits 0 anyway — the MCP will surface a clear error at
 * startup if none of the 4 layers resolve.
 */

import dns from "dns";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

import { FILES } from "./fetch-manifest.js";

// raw.githubusercontent.com's IPv6 edge sometimes serves stale 404 responses
// for newly-pushed files for ~5 min while the IPv4 edge is already fresh.
// Prefer IPv4 to avoid spurious postinstall failures on fresh installs.
dns.setDefaultResultOrder("ipv4first");

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
const DATA_DIR = join(PROJECT_ROOT, "data");

// The jsonui-cli release tag this snapshot is pinned to. Pinning (instead of
// `main`) means an install never bundles definitions newer than the CLI a
// user gets — the snapshot only moves when the pin moves.
//
// Bump procedure (the pin update IS the review point, same idea as the
// JSONUI_CLI_REF SHA pin in JsonUIDocument's deploy.yml):
//   1. jsonui-cli: land the shared/core / conformance change and cut the tag
//   2. update JSONUI_CLI_TAG here
//   3. `npm run fetch-definitions` and commit the data/ diff together with
//      this pin in one commit
// JSONUI_CLI_RAW_BASE still overrides the whole base URL for manual testing.
const JSONUI_CLI_TAG = "v1.8.38";
const BASE_URL =
  process.env.JSONUI_CLI_RAW_BASE ||
  `https://raw.githubusercontent.com/Tai-Kimura/jsonui-cli/${JSONUI_CLI_TAG}`;

async function fetchOne(spec) {
  const target = join(DATA_DIR, spec.local);
  const url = spec.envOverride || `${BASE_URL}/${spec.remote}`;

  try {
    console.error(`[fetch-definitions] GET ${url}`);
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const text = await res.text();
    JSON.parse(text); // Validate before writing.
    writeFileSync(target, text, "utf-8");
    console.error(`[fetch-definitions] wrote ${target} (${text.length} bytes)`);
    return true;
  } catch (err) {
    if (existsSync(target)) {
      console.error(
        `[fetch-definitions] fetch failed (${err.message}); keeping existing snapshot at ${target}.`
      );
    } else {
      console.error(
        `[fetch-definitions] fetch failed for ${spec.local} (${err.message}); no bundled snapshot written.`
      );
    }
    return false;
  }
}

async function main() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  const results = await Promise.all(FILES.map(fetchOne));
  const allMissing = results.every((ok, i) => {
    return !ok && !existsSync(join(DATA_DIR, FILES[i].local));
  });

  if (allMissing) {
    console.error(
      "[fetch-definitions] no bundled snapshots available.\n" +
        "  The MCP will try JSONUI_CLI_PATH / ./.jsonui-cli/ / ~/.jsonui-cli/ at startup.\n" +
        "  If none resolve, the server will exit with a clear error."
    );
  }
  // Do not fail install on fetch errors — the layered fallback handles it.
  process.exit(0);
}

main().catch((err) => {
  console.error(`[fetch-definitions] unexpected error: ${err?.stack || err}`);
  process.exit(0);
});
