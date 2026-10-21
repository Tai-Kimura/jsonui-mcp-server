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
 */

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
    "Simulate the server room's cost with `jsonui-doc cost infra --json` (the model, a load scenario under docs/infra/load, prices: the room's own, then fetched, then bundled — USD, on demand). Without date: the month's total, totals by provider (or by node), the top nodes, the dearest day, what has no price / no rule / no load, hours over capacity, notes. With date (YYYY-MM-DD in the scenario's month): that day's top nodes, each with its charge by meter, the price layer, and its peak hour. Also the scenarios there are, the load problems and the price-book warnings (prices.free_dropped: a room's price row dropping a bundled free amount). Needs jsonui-cli 2.3.15+.",
    {
      project_dir: z.string().optional().describe("Project directory with jui.config.json (overrides JUI_PROJECT_DIR env)"),
      scenario: z.string().optional().describe("Load scenario id (default: the first)"),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("One day of the scenario's month (YYYY-MM-DD)"),
      by: z.enum(["provider", "node"]).optional().describe("Group the month's totals by provider (default) or node"),
    },
    async ({ project_dir, scenario, date, by }) => {
      try {
        const projectDir = config.resolveProjectDir(project_dir);
        const args = ["cost", "infra", projectDir, "--json"];
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
