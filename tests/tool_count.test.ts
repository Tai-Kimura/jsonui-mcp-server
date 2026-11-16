/**
 * The tool count is written in two places by hand — the startup log in
 * src/index.ts and the README's "Available Tools (N)" with one "(n)" per
 * group — and the log said 41 (8 test) for a while after the server had
 * 46 (10 test). Both are checked against the tools the source registers:
 * one `server.tool(` per file under src/tools/<group>/, and one register call
 * per tool in index.ts.
 */
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const GROUPS = ["spec", "context", "jui", "doc", "api", "test", "viz", "infra"]; // README Groups A..H, in order

function registeredIn(group: string): string[] {
  const dir = join(ROOT, "src", "tools", group);
  const names: string[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
    const text = readFileSync(join(dir, file), "utf-8");
    for (const m of text.matchAll(/server\.tool\(\s*"([a-z_]+)"/g)) names.push(m[1]);
  }
  return names;
}

const counts = Object.fromEntries(GROUPS.map((g) => [g, registeredIn(g).length]));
const total = Object.values(counts).reduce((a, b) => a + b, 0);

describe("tool count", () => {
  it("every tool directory is a known group", () => {
    const dirs = readdirSync(join(ROOT, "src", "tools"), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    expect(dirs.sort()).toEqual([...GROUPS].sort());
  });

  it("index.ts registers each tool once and its log line says how many, per group", () => {
    const index = readFileSync(join(ROOT, "src", "index.ts"), "utf-8");
    expect(index.match(/^register[A-Za-z]+\(server(, (config|loader))?\);$/gm)!.length).toBe(total);
    const line = index.match(/Registered (\d+) tools \(([^)]*)\)/);
    expect(line).not.toBeNull();
    expect(Number(line![1])).toBe(total);
    expect(line![2]).toBe(GROUPS.map((g) => `${counts[g]} ${g}`).join(" + "));
  });

  it("the README says the same", () => {
    const readme = readFileSync(join(ROOT, "README.md"), "utf-8");
    expect(readme.match(/^## Available Tools \((\d+)\)$/m)![1]).toBe(String(total));
    const headers = [...readme.matchAll(/^### Group ([A-Z]): .*\((\d+)\)$/gm)];
    expect(headers.map((h) => h[1])).toEqual(GROUPS.map((_, i) => String.fromCharCode(65 + i)));
    expect(headers.map((h) => Number(h[2]))).toEqual(GROUPS.map((g) => counts[g]));
  });
});
