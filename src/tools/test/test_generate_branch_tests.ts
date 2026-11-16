import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServerConfig } from "../../config.js";
import { runCli, formatResult } from "../../cli_runner.js";

export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "test_generate_branch_tests",
    "Generate unit-level branch tests from a screen spec's branchContracts " +
      "(vitest / Kotlin JUnit4+Robolectric / Swift XCTest). Only the HTTP " +
      "boundary is mocked — ViewModel, UseCase, Repository and response " +
      "decoding all run for real. The generated test file and runtime are " +
      "@generated; the harness skeleton is emitted once and then owned by " +
      "the project. Screens with no branchContracts section are an error, " +
      "not a no-op",
    {
      screen: z
        .string()
        .describe("Screen name in snake_case (resolves <spec_directory>/<screen>.spec.json)"),
      platform: z
        .enum(["web", "android", "ios"])
        .optional()
        .describe(
          "Target platform (default web). android additionally requires " +
            "`package`; ios additionally requires `module`"
        ),
      package: z
        .string()
        .optional()
        .describe("Kotlin package for the generated sources — required for platform 'android'"),
      module: z
        .string()
        .optional()
        .describe("App module name for @testable import — required for platform 'ios'"),
      spec: z
        .string()
        .optional()
        .describe("Explicit spec file path (overrides spec_directory resolution)"),
      out_dir: z
        .string()
        .optional()
        .describe("Output directory for the @generated test + runtime files"),
      harness_dir: z
        .string()
        .optional()
        .describe("Project-owned harness directory (skeleton written only when absent)"),
      mocks_dir: z
        .string()
        .optional()
        .describe("Directory scanned for *.mock.json scenario files"),
      project_dir: z.string().optional().describe("Project directory (overrides JUI_PROJECT_DIR env)"),
    },
    async (params) => {
      try {
        const projectDir = config.resolveProjectDir(params.project_dir);
        const args = ["generate", "branch-tests", params.screen];
        if (params.platform) { args.push("--platform", params.platform); }
        if (params.package) { args.push("--package", params.package); }
        if (params.module) { args.push("--module", params.module); }
        if (params.spec) { args.push("--spec", params.spec); }
        if (params.out_dir) { args.push("--out-dir", params.out_dir); }
        if (params.harness_dir) { args.push("--harness-dir", params.harness_dir); }
        if (params.mocks_dir) { args.push("--mocks-dir", params.mocks_dir); }

        const result = await runCli("jsonui-test", args, { cwd: projectDir });
        return { content: [{ type: "text", text: formatResult(result) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }] };
      }
    }
  );
}
