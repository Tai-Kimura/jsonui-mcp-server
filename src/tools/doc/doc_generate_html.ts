import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServerConfig } from "../../config.js";
import { runCli, formatResult } from "../../cli_runner.js";

export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "doc_generate_html",
    "Generate HTML documentation site with index from a directory of test files. Supports multi-app sites (apps) and extra markdown doc directories (docs_dirs), same as the jsonui-doc CLI",
    {
      input_dir: z.string().describe("Directory containing .test.json files"),
      output_dir: z.string().optional().describe("Output directory for HTML files"),
      title: z.string().optional().describe("Documentation title"),
      apps: z.array(z.string()).optional().describe("App sections as NAME:DIR entries (repeatable --app); for multi-app whole-site generation"),
      docs_dirs: z.array(z.string()).optional().describe("Additional markdown doc directories (repeatable -d/--docs)"),
      figma_dir: z.string().optional().describe("Figma assets directory (-fig)"),
      layouts_dir: z.string().optional().describe("Layouts directory override (--layouts-dir)"),
      with_checks: z.boolean().optional().describe("Run doc contract checks during generation (--with-checks)"),
      project_dir: z.string().optional().describe("Project directory (overrides JUI_PROJECT_DIR env)"),
    },
    async (params) => {
      try {
        const projectDir = config.resolveProjectDir(params.project_dir);
        const args = ["generate", "html", params.input_dir];
        if (params.output_dir) { args.push("-o", params.output_dir); }
        if (params.title) { args.push("-t", params.title); }
        for (const app of params.apps ?? []) { args.push("--app", app); }
        for (const dir of params.docs_dirs ?? []) { args.push("-d", dir); }
        if (params.figma_dir) { args.push("-fig", params.figma_dir); }
        if (params.layouts_dir) { args.push("--layouts-dir", params.layouts_dir); }
        if (params.with_checks) { args.push("--with-checks"); }

        // 10 minutes. Through 2.26.1 this ran on the 60 s default: a site of
        // 754 pages took 22 s on an idle machine, and on a loaded one (load
        // average 300+) passed 60 s, was stopped part-way and left docs/html
        // half-rewritten (ticket mcp-doc-generate-html-timeout-leaves-partial-
        // output). A run stopped at its limit says so, with the shell command.
        const result = await runCli("jsonui-doc", args, { cwd: projectDir, timeout: 600_000 });
        return { content: [{ type: "text", text: formatResult(result) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }] };
      }
    }
  );
}
