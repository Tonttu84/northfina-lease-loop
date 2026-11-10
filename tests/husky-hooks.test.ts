// The Git hooks in .husky/ run as shell scripts (husky runs each one with `sh -e`). These tests run
// the pre-push hook with a fake `npm` first on PATH, so a check that fails must stop the push.
// The trap they pin: under `set -e`, a failure in an `a && b && c` list exits only when it is the
// last command, so `npm run typecheck && npm test && …` let a failing type check or test through.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

/** Every spawned shell gets this deadline (AGENTS.md rule 11). */
const SPAWN_TIMEOUT_MS = 30_000;

/** The pre-push steps in the order the hook runs them, as the fake npm names them. */
const PRE_PUSH_STEPS = ['typecheck', 'test', 'check:file-size', 'check:no-ai'];

/**
 * `sh` on PATH, or on Windows the one Git ships (`<git>/bin/sh.exe`, found from `git --exec-path`)
 * when the tests run from a shell whose PATH lacks it.
 */
function findSh(): string {
  const probe = spawnSync('sh', ['-c', 'exit 0'], { timeout: SPAWN_TIMEOUT_MS });
  if (!probe.error && probe.status === 0) return 'sh';
  let gitSh = '(git not found)';
  try {
    const execPath = execFileSync('git', ['--exec-path'], {
      encoding: 'utf8',
      timeout: SPAWN_TIMEOUT_MS,
    }).trim();
    // <git>/mingw64/libexec/git-core -> <git>/bin/sh.exe
    gitSh = path.join(execPath, '..', '..', '..', 'bin', 'sh.exe');
  } catch {
    // No git on PATH: reported below.
  }
  if (gitSh.endsWith('sh.exe') && existsSync(gitSh)) return gitSh;
  throw new Error(
    `no sh on PATH and no Git sh.exe at ${gitSh}; run the tests from Git Bash or put Git's bin on PATH`
  );
}

/**
 * A fake `npm`: logs the script it was asked to run (`npm test` and `npm run <name>` alike) and
 * exits 1 when that script is the one named in FAKE_NPM_FAIL, 0 otherwise.
 */
const FAKE_NPM = `#!/bin/sh
if [ "$1" = "run" ]; then name="$2"; else name="$1"; fi
echo "$name" >> "$FAKE_NPM_LOG"
if [ "$name" = "$FAKE_NPM_FAIL" ]; then exit 1; fi
exit 0
`;

let sh: string;
let fakeBin: string | undefined;

beforeAll(() => {
  sh = findSh();
  fakeBin = mkdtempSync(path.join(tmpdir(), 'lease-loop-hooks-'));
  writeFileSync(path.join(fakeBin, 'npm'), FAKE_NPM, { mode: 0o755 });
});

afterAll(() => {
  // beforeAll may have thrown before the folder existed.
  if (fakeBin) rmSync(fakeBin, { recursive: true, force: true });
});

/** Runs `.husky/pre-push` with the fake npm; `failing` names the one script that fails. */
function runPrePush(failing: string | null) {
  // No `:` in the name: on Windows `calls-check:no-ai.log` is an NTFS stream, not a file.
  if (!fakeBin) throw new Error('the fake npm folder was not made (beforeAll failed)');
  const log = path.join(fakeBin, `calls-${(failing ?? 'none').replace(/\W/g, '-')}.log`);
  rmSync(log, { force: true });
  const result = spawnSync(sh, [path.join('.husky', 'pre-push')], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: SPAWN_TIMEOUT_MS,
    env: {
      ...process.env,
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
      FAKE_NPM_LOG: log,
      FAKE_NPM_FAIL: failing ?? '',
    },
  });
  if (result.error) throw result.error;
  let calls: string[] = [];
  try {
    calls = readFileSync(log, 'utf8').split(/\r?\n/).filter(Boolean);
  } catch {
    // No log: the fake npm never ran.
  }
  return { status: result.status, stdout: result.stdout, calls };
}

describe('.husky/pre-push', () => {
  it('passes when every check passes, after running all four in order', () => {
    const { status, stdout, calls } = runPrePush(null);
    expect(status).toBe(0);
    expect(calls).toEqual(PRE_PUSH_STEPS);
    expect(stdout).toContain('Ready to push');
  });

  it.each(PRE_PUSH_STEPS.map((step, index) => [step, index] as const))(
    'fails the push when %s fails, and runs nothing after it',
    (step, index) => {
      const { status, stdout, calls } = runPrePush(step);
      expect(status).not.toBe(0);
      expect(calls).toEqual(PRE_PUSH_STEPS.slice(0, index + 1));
      expect(stdout).not.toContain('Ready to push');
    }
  );
});

describe('.husky hooks', () => {
  // The same trap in any hook: `set -e` ignores a failure in every command of an `&&` list but
  // the last. One command per line instead.
  it.each(['pre-commit', 'commit-msg', 'pre-push'])(
    '%s chains no commands with && under set -e',
    (hook) => {
      const lines = readFileSync(path.join(repoRoot, '.husky', hook), 'utf8').split(/\r?\n/);
      const chained = lines.filter((line) => !/^\s*#/.test(line) && line.includes('&&'));
      expect(chained, 'put each command on its own line').toEqual([]);
    }
  );
});
