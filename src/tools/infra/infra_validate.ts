import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServerConfig } from "../../config.js";
import { ContractError, FIRST, failure, need, problems, runDocJson, text } from "./infra_common.js";

/**
 * `jsonui-doc validate infra <project> --json`: the room's model (docs/infra/*.json, or jui.config.json's infra.dir)
 * read as jui viz reads it — each file against the schema and the shapes of secrets, then merged, and its flows
 * walked. Exit 0: no error (warnings alone are 0); 1: errors; 2: nothing could be read (reason).
 *
 * Migration plans (jsonui-cli 2.3.20+, docs/infra/migrations/<name>/changes.json + removals.json): the CLI checks every
 * plan with the model, or one with `--migration <name>`, and lists them under "migrations". A plan's error makes the
 * exit 1 while the model's own problems are empty, so a room that has plans gets their summary here — without it the
 * exit would name an error the answer does not show. A room with none answers exactly as before.
 */

function migrationSummary(m: any) {
  need(m, ["name", "dir", "ok", "problems", "steps", "counts"], "validate infra migration");
  return {
    name: m.name,
    dir: m.dir,
    ok: m.ok,
    counts: m.counts,
    problems: problems(m.problems, "validate infra migration"),
    steps: m.steps.length,
    firstSteps: m.steps.slice(0, FIRST).map((s: any) => {
      need(s, ["index", "kind", "node"], "validate infra migration step");
      return { index: s.index, kind: s.kind, node: s.node,
        ...(s.edgesRemoved?.length ? { edgesRemoved: s.edgesRemoved } : {}),
        ...(s.edgesAdded?.length ? { edgesAdded: s.edgesAdded } : {}) };
    }),
  };
}
function migrations(data: any, plan: string | undefined) {
  if (plan) need(data, ["migrations"], "validate infra --migration");
  const list = data.migrations;
  if (list === undefined || (Array.isArray(list) && !list.length && !plan)) return {};
  if (!Array.isArray(list)) throw new ContractError('validate infra: "migrations" is not a list');
  return { migrations: list.map(migrationSummary) };
}

export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "infra_validate",
    "Validate the server room's infra model (docs/infra/*.json: environments, groups, nodes, edges, flows) with `jsonui-doc validate infra --json`. Returns whether it could be read (and why not), the files used, the counts, and the problems by severity and code with the first 20 (file, path, code, message). Flow problems (flow.*) name the rule a step most likely missed. When the room has migration plans (docs/infra/migrations/<name>/changes.json + removals.json), each plan's check too: its problems (migration.remove_missing / duplicate / both / order_unknown / edge_end, and the infra checks on the merged new model), its counts (added, replaced, removed, edges added / removed) and its steps in order; `plan` checks that one plan only. Needs jsonui-cli 2.3.15+ (plans: 2.3.20+).",
    {
      project_dir: z.string().optional().describe("Project directory with jui.config.json (overrides JUI_PROJECT_DIR env)"),
      plan: z.string().optional().describe("One migration plan's name (its folder under docs/infra/migrations); default: every plan"),
    },
    async ({ project_dir, plan }) => {
      try {
        const projectDir = config.resolveProjectDir(project_dir);
        const args = ["validate", "infra", projectDir, "--json"];
        if (plan) args.push("--migration", plan);
        const { exitCode, data } = await runDocJson(args, projectDir);
        need(data, ["ok"], "validate infra");
        if (!data.ok && data.reason !== "invalid") {
          need(data, ["reason", "message"], "validate infra");
          return text({ ok: false, exit: exitCode, readable: false, reason: data.reason, message: data.message });
        }
        need(data, ["dir", "files", "problems"], "validate infra");
        return text({
          ok: exitCode === 0,
          exit: exitCode,
          readable: data.ok,
          dir: data.dir,
          files: data.files,
          environments: (data.environments ?? []).map((e: any) => e.id),
          counts: data.counts ?? null,
          flows: Array.isArray(data.flows) ? data.flows.length : null,
          problems: problems(data.problems, "validate infra"),
          ...migrations(data, plan),
        });
      } catch (e: any) {
        return failure(e);
      }
    }
  );
}
