import { execFile } from "child_process";

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export async function runCli(
  command: string,
  args: string[],
  options: { cwd: string; timeout?: number }
): Promise<CliResult> {
  const timeout = options.timeout ?? 60_000;

  return new Promise((resolve) => {
    execFile(
      command,
      args,
      {
        cwd: options.cwd,
        timeout,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      },
      (error, stdout, stderr) => {
        if (error && "killed" in error && error.killed) {
          resolve({
            exitCode: 1,
            stdout: stdout || "",
            stderr: `Command timed out after ${timeout / 1000}s`,
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
  });
}

export function formatResult(result: CliResult): string {
  return JSON.stringify(
    {
      success: result.exitCode === 0,
      output: result.stdout,
      errors: result.stderr || undefined,
    },
    null,
    2
  );
}
