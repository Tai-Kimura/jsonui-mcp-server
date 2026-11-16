import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServerConfig } from "../../config.js";
import { runCli, formatResult } from "../../cli_runner.js";

export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "jui_generate_project",
    "Generate Layout JSON and ViewModel files from screen specs (all or single spec). " +
      "A Layout JSON it generates — a screen's, or a Collection cell / header / footer's — is " +
      "written when it is not there, left as it is when it already holds exactly what the spec " +
      "generates, and otherwise KEPT (the Layout JSON is hand-edited after generation) and named " +
      "in the output with \"Kept existing … layout: <file> … --force replaces it\". From " +
      "jsonui-cli 1.9.0; an earlier jui rewrote an existing layout on every run.",
    {
      spec_file: z.string().optional().describe("Single spec file to process (e.g., 'login.spec.json')"),
      force: z.boolean().optional().describe(
        "Replace the ViewModel declaration files, and each Layout JSON that already exists and " +
          "differs from what the spec generates (kept and named without it). A layout whose data " +
          "section holds entries the spec does not declare is not replaced even with force — the " +
          "output names them. Called from here the command has no terminal, so it never asks: " +
          "without force an existing layout is kept."
      ),
      skip_layout: z.boolean().optional().describe("Skip Layout JSON generation"),
      dry_run: z.boolean().optional().describe("Show what would be generated without writing"),
      platform: z.enum(["ios", "android", "web"]).optional().describe("Generate for single platform only"),
      project_dir: z.string().optional().describe("Project directory (overrides JUI_PROJECT_DIR env)"),
    },
    async (params) => {
      try {
        const projectDir = config.resolveProjectDir(params.project_dir);
        const args = ["generate", "project"];
        if (params.spec_file) { args.push("--file", params.spec_file); }
        if (params.force) { args.push("--force"); }
        if (params.skip_layout) { args.push("--skip-layout"); }
        if (params.dry_run) { args.push("--dry-run"); }
        if (params.platform === "ios") { args.push("--ios-only"); }
        if (params.platform === "android") { args.push("--android-only"); }
        if (params.platform === "web") { args.push("--web-only"); }

        const result = await runCli("jui", args, { cwd: projectDir, timeout: 120_000 });
        return { content: [{ type: "text", text: formatResult(result) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }] };
      }
    }
  );
}
