#!/usr/bin/env node
/**
 * Post-install hook: fetch the latest attribute_definitions.json from
 * the jsonui-cli main branch and write it to `data/attribute_definitions.json`.
 *
 * This populates the 4th-layer fallback in spec_loader.ts (the bundled
 * snapshot). Users who install jsonui-cli separately will prefer that
 * checkout via the higher-priority fallback layers; users who don't have
 * jsonui-cli installed get a working MCP with the bundled snapshot.
 *
 * The fetch is best-effort. If the network is unavailable at install time
 * (CI sandbox, offline install, etc.) and no existing snapshot is present,
 * the script exits 0 anyway — the MCP will surface a clear error at
 * startup if none of the 4 layers resolve.
 */

import { existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
const DATA_DIR = join(PROJECT_ROOT, "data");
const TARGET = join(DATA_DIR, "attribute_definitions.json");

const SOURCE_URL =
  process.env.JSONUI_ATTR_DEFINITIONS_URL ||
  "https://raw.githubusercontent.com/Tai-Kimura/jsonui-cli/main/shared/core/attribute_definitions.json";

async function main() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  try {
    console.error(`[fetch-definitions] GET ${SOURCE_URL}`);
    const res = await fetch(SOURCE_URL, { redirect: "follow" });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    const text = await res.text();
    // Validate it parses as JSON before writing.
    JSON.parse(text);
    writeFileSync(TARGET, text, "utf-8");
    console.error(`[fetch-definitions] wrote ${TARGET} (${text.length} bytes)`);
  } catch (err) {
    if (existsSync(TARGET)) {
      console.error(
        `[fetch-definitions] fetch failed (${err.message}); keeping existing snapshot at ${TARGET}.`
      );
    } else {
      console.error(
        `[fetch-definitions] fetch failed (${err.message}); no bundled snapshot written.\n` +
          `  The MCP will try JSONUI_CLI_PATH / ./.jsonui-cli/ / ~/.jsonui-cli/ at startup.\n` +
          `  If none resolve, the server will exit with a clear error.`
      );
    }
    // Do not fail install on fetch errors — the layered fallback handles it.
    process.exit(0);
  }
}

main().catch((err) => {
  console.error(`[fetch-definitions] unexpected error: ${err?.stack || err}`);
  process.exit(0);
});
