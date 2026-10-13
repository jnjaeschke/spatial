import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const MAX_BUFFER = 512 * 1024 * 1024;

export interface GitRunOptions {
  /** Added to the process environment. */
  env?: Record<string, string>;
  /** Milliseconds before git is killed and the run rejects. */
  timeout?: number;
  /** Kills git and rejects the run when aborted. */
  signal?: AbortSignal;
  /** Text supplied on stdin. */
  input?: string;
}

/** Runs git in `repo` with the settings every read here uses; resolves with stdout and rejects with git's error. */
export async function runGit(repo: string, args: string[], { env, timeout, signal, input }: GitRunOptions = {}): Promise<string> {
  const pending = exec("git", ["-C", repo, "-c", "core.quotePath=false", "-c", "log.showSignature=false", ...args], { maxBuffer: MAX_BUFFER, encoding: "utf8", ...(env ? { env: { ...process.env, ...env } } : {}), ...(timeout ? { timeout } : {}), ...(signal ? { signal } : {}) });
  if (input !== undefined) pending.child.stdin!.end(input);
  const { stdout } = await pending;
  return stdout;
}

/** git's own message for a failed run: its stderr, else the error's message. */
export const gitMessage = (error: unknown): string => ((error as { stderr?: string }).stderr || (error as Error).message).trim();

export const hasExitCode = (error: unknown, code: number): boolean => (error as { code?: number }).code === code;

export function safeRepoPath(path: string): string {
  if (!path || path.startsWith("/") || path.startsWith("\\") || /^[A-Za-z]:[\\/]/.test(path) || path.split(/[\\/]/).includes("..")) throw new Error(`Invalid path: ${path}`);
  return path;
}

export function safeRevision(value: string, name: string): string {
  if (!value || value.startsWith("-")) throw new Error(`Invalid ${name}: ${value}`);
  return value;
}
