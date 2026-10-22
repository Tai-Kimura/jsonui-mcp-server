import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServerConfig } from "../../config.js";
import { FIRST, failure, need, problems, runDocJson, text } from "./infra_common.js";

/**
 * `jsonui-doc cost infra <project> --json`: the cost simulator's month (or one day) for a load scenario, the same
 * simulation and shapes as jui viz's コスト. The month's whole reply (every day's stack) and above all a day's (every
 * node's 24 hours with each meter's price trace, ~300 KB) are too long for an agent; this keeps what answers "what
 * does it cost and why": the total, the totals per stack key, the top nodes, what has no price / rule / load, the
 * hours over capacity, the notes, the load problems and the price-book warnings — and for a day, each top node's
 * charge by meter with the price layer it came from. Exit 0: simulated; 1: simulated, a load file has an error (left
 * out); 2: nothing simulated (reason).
 *
 * With `plan` (jsonui-cli 2.3.20+, `--migration <name>`): the same engine run on the old model and on the new one (old
 * + changes − removals), and the difference — the totals, per node (what the plan added, replaced, removed or left),
 * per provider, after each step of the plan, and for one account when `account` is given. Nothing is computed here.
 * A plan with an error is not priced: the CLI refuses it (exit 2, reason bad_plan, the plan's problems), as it does a
 * plan name with no folder (no_plan) — both answered by the refusal path below, problems counted.
 */

function migrationSummary(data: any) {
  need(data, ["migration", "scenario", "old", "new", "diff", "byNode", "byProvider", "steps", "account"],
    "cost infra --migration");
  for (const k of ["old", "new", "diff"]) need(data[k], ["usd"], `cost infra --migration ${k}`);
  for (const n of data.byNode) need(n, ["node", "change", "old", "new", "diff"], "cost infra --migration node");
  for (const s of data.steps) need(s, ["index", "node", "usd", "diff"], "cost infra --migration step");
  if (data.account !== null) need(data.account, ["on", "old", "new", "diff"], "cost infra --migration account");
  const changed = data.byNode.filter((n: any) => n.change !== "same" || n.diff !== 0);
  const byChange: Record<string, number> = {};
  for (const n of data.byNode) byChange[n.change] = (byChange[n.change] ?? 0) + 1;
  return {
    migration: data.migration,
    scenario: data.scenario,
    usd: { old: data.old.usd, new: data.new.usd, diff: data.diff.usd },
    nodes: byChange,
    // the biggest movements first, whichever way
    topChanges: [...changed].sort((a: any, b: any) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, FIRST),
    changedCount: changed.length,
    byProvider: data.byProvider,
    steps: data.steps,
    account: data.account,
  };
}

function monthSummary(m: any) {
  need(m, ["scenario", "month", "usd", "by", "keys", "days", "noPrice", "noRule", "loadUndefined", "overflowHours",
    "warnings", "warningCount"], "cost infra month");
  const totals: Record<string, number> = {};
  for (const d of m.days) {
    need(d, ["date", "usd", "stack"], "cost infra day of the month");
    for (const [k, v] of Object.entries(d.stack)) totals[k] = (totals[k] ?? 0) + (v as number);
  }
  const label = Object.fromEntries(m.keys.map((k: any) => [k.key, k.label]));
  return {
    scenario: m.scenario,
    month: m.month,
    usd: m.usd,
    by: m.by,
    totals: Object.entries(totals).sort((a, b) => b[1] - a[1])
      .map(([key, usd]) => ({ key: key === "__others__" ? "others" : key, label: label[key] ?? key, usd })),
    days: m.days.length,
    dearestDay: m.days.reduce((a: any, b: any) => (b.usd > a.usd ? b : a), m.days[0])?.date ?? null,
    noPrice: m.noPrice,
    noRule: m.noRule,
    loadUndefined: m.loadUndefined,
    overflowHours: m.overflowHours,
    notes: m.warnings.slice(0, FIRST).map((w: any) => (typeof w === "string" ? w : w.message)),
    noteCount: m.warningCount,
  };
}

function daySummary(day: any) {
  need(day, ["scenario", "date", "usd", "nodes", "others"], "cost infra day");
  return {
    scenario: day.scenario,
    date: day.date,
    usd: day.usd,
    nodes: day.nodes.map((n: any) => {
      need(n, ["node", "usd", "hours"], "cost infra day node");
      const meters: Record<string, { usd: number; amount: number; unit: string; sku: string; layer: string | null }> = {};
      let peak = { hour: 0, usd: -1 };
      n.hours.forEach((h: any, i: number) => {
        if (h.usd > peak.usd) peak = { hour: day.hours?.[i] ?? i, usd: h.usd };
        for (const s of h.segments ?? []) {
          const m = (meters[s.meter] ??= { usd: 0, amount: 0, unit: s.unit, sku: s.sku, layer: s.price?.layer ?? null });
          m.usd += s.usd ?? 0;
          m.amount += s.amount ?? 0;
        }
      });
      const overflowHours = n.hours.filter((h: any) => h.load && h.load.overflow > 0).length;
      return {
        node: n.node, label: n.label, provider: n.provider, rule: n.rule, note: n.note || undefined, usd: n.usd,
        peakHour: peak.usd >= 0 ? peak.hour : null, meters, overflowHours: overflowHours || undefined,
      };
    }),
    others: { count: day.others.count, usd: (day.others.usd as number[]).reduce((a, b) => a + b, 0) },
  };
}

export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "infra_cost",
    "Simulate the server room's cost with `jsonui-doc cost infra --json` (the model, a load scenario under docs/infra/load, prices: the room's own, then fetched, then bundled — USD, on demand). Without date: the month's total, totals by provider (or by node), the top nodes, the dearest day, what has no price / no rule / no load, hours over capacity, notes. With date (YYYY-MM-DD in the scenario's month): that day's top nodes, each with its charge by meter, the price layer, and its peak hour. Also the scenarios there are, the load problems and the price-book warnings (prices.free_dropped: a room's price row dropping a bundled free amount). With plan (a migration plan's name, docs/infra/migrations/<name>): the month's old, new and difference — per node (added / replaced / removed / same, the biggest changes first), per provider, after each step of the plan, and for one account with account; date and by do not apply. Needs jsonui-cli 2.3.15+ (plan: 2.3.20+).",
    {
      project_dir: z.string().optional().describe("Project directory with jui.config.json (overrides JUI_PROJECT_DIR env)"),
      scenario: z.string().optional().describe("Load scenario id (default: the first)"),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("One day of the scenario's month (YYYY-MM-DD)"),
      by: z.enum(["provider", "node"]).optional().describe("Group the month's totals by provider (default) or node"),
      plan: z.string().optional().describe("A migration plan's name: the month's old / new / difference instead"),
      account: z.string().optional().describe("With plan: one account (its group id) old / new / difference"),
    },
    async ({ project_dir, scenario, date, by, plan, account }) => {
      try {
        if (!plan && account) return failure(new Error("account applies with plan only"));
        if (plan && (date || by)) return failure(new Error("date and by do not apply with plan: it answers by node and by provider at once, for the month"));
        const projectDir = config.resolveProjectDir(project_dir);
        const args = ["cost", "infra", projectDir, "--json"];
        if (plan) args.push("--migration", plan);
        if (account) args.push("--account", account);
        if (scenario) args.push("--scenario", scenario);
        if (date) args.push("--date", date);
        if (by) args.push("--by", by);
        const { exitCode, data } = await runDocJson(args, projectDir, 180_000);
        need(data, ["ok"], "cost infra");
        if (!data.ok) {
          need(data, ["reason", "message"], "cost infra");
          return text({ ok: false, exit: exitCode, reason: data.reason, message: data.message,
            ...(data.problems ? { problems: problems(data.problems, "cost infra") } : {}) });
        }
        need(data, ["dir", "scenario", "scenarios", "problems", "prices"], "cost infra");
        need(data.problems, ["count", "errors", "first"], "cost infra problems");
        need(data.prices, ["warnings", "warningCount"], "cost infra prices");
        if (plan) {
          // the load problems and price warnings are the old model's reading, as without plan
          return text({ ok: exitCode === 0, exit: exitCode, dir: data.dir, scenarios: data.scenarios,
            ...migrationSummary(data), loadProblems: data.problems, priceWarnings: data.prices.warnings,
            priceWarningCount: data.prices.warningCount });
        }
        const out: Record<string, unknown> = {
          ok: exitCode === 0,
          exit: exitCode,
          dir: data.dir,
          scenario: data.scenario,
          scenarios: data.scenarios,
          loadProblems: data.problems,
          priceWarnings: data.prices.warnings,
          priceWarningCount: data.prices.warningCount,
        };
        if (date) {
          need(data, ["day"], "cost infra");
          out.day = daySummary(data.day);
        } else {
          need(data, ["month", "topNodes"], "cost infra");
          out.month = monthSummary(data.month);
          out.topNodes = data.topNodes;
        }
        return text(out);
      } catch (e: any) {
        return failure(e);
      }
    }
  );
}
