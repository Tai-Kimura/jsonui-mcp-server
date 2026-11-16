import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServerConfig } from "../../config.js";
import { runCli, formatResult } from "../../cli_runner.js";

export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "test_report",
    "Convert one or more results JSON files (results.schema.json format) into a JUnit XML or HTML report via the jsonui-test CLI",
    {
      files: z
        .array(z.string())
        .min(1)
        .describe("Results JSON files to convert (multiple inputs merge into one report)"),
      format: z.enum(["junit", "html"]).describe("Report format"),
      output: z.string().optional().describe("Output file path (default: report.xml / report.html)"),
      project_dir: z.string().optional().describe("Project directory (overrides JUI_PROJECT_DIR env)"),
    },
    async (params) => {
      try {
        const projectDir = config.resolveProjectDir(params.project_dir);
        const args = ["report", ...params.files, "--format", params.format];
        if (params.output) { args.push("--output", params.output); }

        const result = await runCli("jsonui-test", args, { cwd: projectDir });
        return { content: [{ type: "text", text: formatResult(result) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }] };
      }
    }
  );
}
