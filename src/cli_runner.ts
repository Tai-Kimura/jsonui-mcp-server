import { execFile, execFileSync } from "child_process";

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  /** The run did not finish within its limit and was stopped. */
  timedOut?: boolean;
  /** On a timeout: the same command, written to run from a shell. */
  rerunInShell?: string;
}

/** How long a stopped run's processes get to end on SIGTERM before SIGKILL. */
export const KILL_GRACE_MS = 3_000;

/** One shell word: as it is when it needs no quoting, else in single quotes. */
export function shellQuote(word: string): string {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(word)) return word;
  return `'${word.replace(/'/g, `'"'"'`)}'`;
}

/** The command a timed-out run names, to finish it from a shell. */
export function shellCommand(command: string, args: string[], cwd: string): string {
  return `cd ${shellQuote(cwd)} && ${[command, ...args].map(shellQuote).join(" ")}`;
}

/**
 * Every process below `root` (children, theirs, ...), from one `ps` listing;
 * deepest first. Empty where `ps` is not there (Windows) or fails.
 */
export function descendantPids(root: number): number[] {
  let listing: string;
  try {
    listing = execFileSync("ps", ["-A", "-o", "pid=", "-o", "ppid="], { encoding: "utf8" });
  } catch {
    return [];
  }
  const children = new Map<number, number[]>();
  for (const line of listing.split("\n")) {
    const [pid, ppid] = line.trim().split(/\s+/).map(Number);
    if (!Number.isInteger(pid) || !Number.isInteger(ppid)) continue;
    if (!children.has(ppid)) children.set(ppid, []);
    children.get(ppid)!.push(pid);
  }
  const out: number[] = [];
  const walk = (pid: number) => {
    for (const c of children.get(pid) ?? []) {
      walk(c);
      out.push(c);
    }
  };
  walk(root);
  return out;
}

// A run that outlives its limit is stopped with every process it started.
// Through 2.26.1 the limit was execFile's own, which signals the direct child
// only: `jui build` stopped, and the kjui / rjui process it had started went
// on writing the project with nobody waiting for it (reparented to PID 1;
// measured 2026-11-15 on a copy of a distribution lane, stopped at 25 s). The
// reply said the run had failed while the files were still changing.
//
// The runner's own timer is set BEFORE execFile's (timers of one delay fire
// in the order they were set), so it lists the child's descendants while the
// child is still there to hold them: SIGTERM to them and to the child, then
// SIGKILL after a grace for any that ignore it. execFile's own limit stays as
// it was, the fallback where `ps` is not there (Windows).
export async function runCli(
  command: string,
  args: string[],
  options: { cwd: string; timeout?: number }
): Promise<CliResult> {
  const timeout = options.timeout ?? 60_000;

  return new Promise((resolve) => {
    let timedOut = false;
    let child: ReturnType<typeof execFile> | undefined;

    const timer = setTimeout(() => {
      const pid = child?.pid;
      if (pid === undefined) return;
      timedOut = true;
      const signal = (pids: number[], sig: NodeJS.Signals) => {
        for (const p of pids) {
          try {
            process.kill(p, sig);
          } catch {
            // Gone already.
          }
        }
      };
      // Freeze the tree first, so nothing in it starts a process between the
      // listing and the signal: SIGSTOP the child, list, SIGSTOP what was
      // found, list again, until a listing finds nothing new (a few rounds).
      const tree = new Set<number>([pid]);
      signal([pid], "SIGSTOP");
      for (let round = 0; round < 8; round++) {
        const fresh = descendantPids(pid).filter((p) => !tree.has(p));
        if (fresh.length === 0) break;
        fresh.forEach((p) => tree.add(p));
        signal(fresh, "SIGSTOP");
      }
      const all = [...tree];
      signal(all, "SIGTERM");
      // A stopped process takes SIGTERM when it runs again.
      signal(all, "SIGCONT");
      setTimeout(() => signal(all, "SIGKILL"), KILL_GRACE_MS).unref();
    }, timeout);
    timer.unref();

    child = execFile(
      command,
      args,
      {
        cwd: options.cwd,
        timeout,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      },
      (error, stdout, stderr) => {
        clearTimeout(timer);
        if (timedOut || (error && "killed" in error && error.killed)) {
          const rerun = shellCommand(command, args, options.cwd);
          resolve({
            exitCode: 1,
            stdout: stdout || "",
            stderr:
              `Command timed out after ${timeout / 1000}s and was stopped, with every process it started. ` +
              "It was stopped part-way: whatever it writes (generated files, docs/html, the generation " +
              "manifest) may be left half-updated — some files new, the rest as before. Run it from a " +
              `shell to finish, where nothing stops it: ${rerun}`,
            timedOut: true,
            rerunInShell: rerun,
          });
          return;
        }
        resolve({
          exitCode: error ? (error as any).code ?? 1 : 0,
          stdout: stdout || "",
          stderr: stderr || "",
        });
      }
    );

    // Nothing is ever written to the child's stdin: end it now, so a CLI that
    // reads stdin — an overwrite prompt — sees end-of-file instead of waiting
    // for a line that never comes. Through 2.13.1 the pipe stayed open, and such
    // a child waited until the timeout above killed it (`jui g converter` on
    // an existing component, measured 2026-09-26).
    child.stdin?.end();
  });
}

export function formatResult(result: CliResult): string {
  return JSON.stringify(
    {
      success: result.exitCode === 0,
      output: result.stdout,
      errors: result.stderr || undefined,
      timedOut: result.timedOut || undefined,
      rerunInShell: result.rerunInShell,
    },
    null,
    2
  );
}
