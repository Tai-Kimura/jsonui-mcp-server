#!/usr/bin/env node
/**
 * Post-install hook: fetch the latest data files from the jsonui-cli main
 * branch and write them into `data/`. These populate the 4th-layer fallback
 * in spec_loader.ts (the bundled snapshot).
 *
 * Files fetched:
 *   - shared/core/attribute_definitions.json
 *   - shared/core/component_metadata.json
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

// raw.githubusercontent.com's IPv6 edge sometimes serves stale 404 responses
// for newly-pushed files for ~5 min while the IPv4 edge is already fresh.
// Prefer IPv4 to avoid spurious postinstall failures on fresh installs.
dns.setDefaultResultOrder("ipv4first");

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
const DATA_DIR = join(PROJECT_ROOT, "data");

const BASE_URL =
  process.env.JSONUI_CLI_RAW_BASE ||
  "https://raw.githubusercontent.com/Tai-Kimura/jsonui-cli/main";

const FILES = [
  {
    remote: "shared/core/attribute_definitions.json",
    local: "attribute_definitions.json",
    envOverride: process.env.JSONUI_ATTR_DEFINITIONS_URL,
  },
  {
    remote: "shared/core/component_metadata.json",
    local: "component_metadata.json",
    envOverride: process.env.JSONUI_COMPONENT_METADATA_URL,
  },
];

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
