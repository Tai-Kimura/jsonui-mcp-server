import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServerConfig } from "../../config.js";
import { runCli, formatResult } from "../../cli_runner.js";

export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "jui_generate_converter",
    "Generate custom component converter code for each platform",
    {
      name: z.string().optional().describe("Component name (direct mode, e.g., 'MyComponent')"),
      from_spec: z.string().optional().describe("Generate from component spec file path"),
      all: z.boolean().optional().describe("Generate from all component specs"),
      attributes: z.string().optional().describe("Attributes in key:type format (e.g., 'prop1:String,prop2:Int')"),
      container: z.boolean().optional().describe("Mark as container component"),
      skip_existing: z.boolean().optional().describe(
        "Leave existing converter files untouched (no overwrite prompt). " +
        "`jui build` enables this automatically; pass it here for idempotent " +
        "explicit scaffold runs."
      ),
      project_dir: z.string().optional().describe("Project directory (overrides JUI_PROJECT_DIR env)"),
    },
    async (params) => {
      try {
        const projectDir = config.resolveProjectDir(params.project_dir);
        const args = ["generate", "converter"];
        if (params.name) { args.push(params.name); }
        if (params.from_spec) { args.push("--from", params.from_spec); }
        if (params.all) { args.push("--all"); }
        if (params.attributes) { args.push("--attributes", params.attributes); }
        if (params.container) { args.push("--container"); }
        if (params.skip_existing) { args.push("--skip-existing"); }

        const result = await runCli("jui", args, { cwd: projectDir });
        return { content: [{ type: "text", text: formatResult(result) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }] };
      }
    }
  );
}
