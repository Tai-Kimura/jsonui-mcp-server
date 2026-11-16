/**
 * Global test setup — makes every test hermetic by default.
 *
 * The server reads three ambient inputs that must never leak in from the
 * machine running the tests:
 *
 *   - `$JSONUI_CLI_PATH`  (layer 1 of the SpecLoader fallback)
 *   - `$HOME` / `~/.jsonui-cli`  (layer 3 — real installs exist on dev boxes)
 *   - `$JUI_PROJECT_DIR`  (ServerConfig default project dir)
 *
 * We delete the env vars and point HOME at a fresh empty temp directory.
 * Individual tests that exercise a specific layer re-set these explicitly.
 *
 * Note: process.cwd() (layer 2) is handled per-suite via process.chdir()
 * because it can't be neutralized globally without breaking module paths.
 */
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

delete process.env.JSONUI_CLI_PATH;
delete process.env.JUI_PROJECT_DIR;

const isolatedHome = mkdtempSync(join(tmpdir(), "jui-mcp-test-home-"));
process.env.HOME = isolatedHome;
// Windows fallback used by os.homedir(); harmless elsewhere.
process.env.USERPROFILE = isolatedHome;
