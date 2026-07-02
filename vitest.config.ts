import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Tests use process.chdir() to control the "cwd" fallback layer of the
    // SpecLoader, which is unavailable in worker threads — force child
    // process isolation.
    pool: "forks",
    // Hermeticity guard: strip environment leakage from the developer's real
    // machine (a real ~/.jsonui-cli install, JSONUI_CLI_PATH, JUI_PROJECT_DIR)
    // before any test module is imported.
    setupFiles: ["tests/setup.ts"],
  },
});
