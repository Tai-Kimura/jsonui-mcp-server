import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { ServerConfig } from "../../config.js";
import { ContractError, FIRST, failure, need, text } from "./infra_common.js";
import { runCli } from "../../cli_runner.js";

/**
 * `jsonui-doc seed infra <project> -o <dir>`: a draft model from what the project already says (Compose, Terraform /
 * OpenTofu, Kubernetes, CloudFormation / SAM / CDK, wrangler, PaaS files, SDK imports and env names; never state,
 * tfvars or .env values), and its report (what it read, what it could not place). By default the draft is written to
 * a temp folder and read back — nothing in the project changes; write: true writes <infra.dir>/seed (the draft is a
 * starting point, never read as the model). Exit 0: drafted; 2: refused (bad config, the draft fails its own check,
 * or a draft is already there without force).
 */

function infraDir(projectDir: string): string {
  try {
    const cfg = JSON.parse(readFileSync(join(projectDir, "jui.config.json"), "utf-8"));
    if (typeof cfg?.infra?.dir === "string") return cfg.infra.dir;
  } catch {
    // no config, or not JSON: the CLI says so itself
  }
  return "docs/infra";
}

function readJson(path: string, what: string): any {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    throw new ContractError(`seed infra wrote no readable ${what} at ${path}`);
  }
}

export function summarize(draft: any, report: any) {
  need(draft, ["nodes", "groups", "edges"], "seed infra draft");
  need(report, ["inputs", "unmatched", "skipped", "skippedCount", "notes", "withheld"], "seed infra report");
  return {
    counts: { nodes: draft.nodes.length, groups: draft.groups.length, edges: draft.edges.length,
      flows: Array.isArray(draft.flows) ? draft.flows.length : 0 },
    environments: (draft.environments ?? []).map((e: any) => e.id),
    nodes: draft.nodes.slice(0, 50).map((n: any) => ({
      id: n.id, category: n.category, provider: n.provider, service: n.service, iac: n.iac, environments: n.environments,
    })),
    inputs: report.inputs,
    unmatched: Object.fromEntries(Object.entries(report.unmatched).map(([provider, u]: [string, any]) =>
      [provider, { count: u.count, items: (u.items ?? []).slice(0, FIRST) }])),
    notDrawn: report.notDrawn ?? {},
    skipped: { count: report.skippedCount, first: report.skipped.slice(0, FIRST) },
    notes: report.notes.slice(0, FIRST),
    withheld: report.withheld,
  };
}

export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "infra_seed",
    "Draft the server room's model from the project's IaC, config files and code with `jsonui-doc seed infra` (Compose, Terraform/OpenTofu, Kubernetes, CloudFormation/SAM/CDK, wrangler, Firebase/PaaS files, SDK imports and env var names — never Terraform state, tfvars or .env values). Returns the draft's counts and nodes (id, category, provider, service, iac), what was read, what could not be placed (unmatched, by provider) or was skipped, and notes. By default nothing in the project is written; write: true writes <infra.dir>/seed/draft.json and seed-report.json (a starting point to copy from — the model is docs/infra/*.json).",
    {
      project_dir: z.string().optional().describe("Project directory with jui.config.json (overrides JUI_PROJECT_DIR env)"),
      write: z.boolean().optional().describe("Write the draft to <infra.dir>/seed in the project (default false: read only)"),
      force: z.boolean().optional().describe("With write: replace a draft already there"),
    },
    async ({ project_dir, write, force }) => {
      const temp = write ? null : mkdtempSync(join(tmpdir(), "jui-mcp-seed-"));
      try {
        const projectDir = config.resolveProjectDir(project_dir);
        const out = temp ?? join(projectDir, infraDir(projectDir), "seed");
        const args = ["seed", "infra", projectDir, "-o", out];
        if (write && force) args.push("--force");
        const result = await runCli("jsonui-doc", args, { cwd: projectDir, timeout: 180_000 });
        if (result.exitCode !== 0 || !existsSync(join(out, "draft.json"))) {
          return text({ ok: false, exit: result.exitCode,
            message: (result.stderr || result.stdout).trim().split("\n").slice(-5).join("\n") });
        }
        const summary = summarize(readJson(join(out, "draft.json"), "draft.json"),
          readJson(join(out, "seed-report.json"), "seed-report.json"));
        return text({ ok: true, exit: 0, written: write ? out : null, ...summary });
      } catch (e: any) {
        return failure(e);
      } finally {
        if (temp) rmSync(temp, { recursive: true, force: true });
      }
    }
  );
}
