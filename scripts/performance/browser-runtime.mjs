import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export const LOCAL_URL = 'http://127.0.0.1:4174';

const wait = (milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));

async function isReachable(url) {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    return response.ok;
  } catch {
    return false;
  }
}

export async function ensureServer(url = LOCAL_URL) {
  if (await isReachable(url)) return async () => {};
  if (new URL(url).origin !== LOCAL_URL) throw new Error(`Cannot start a server for remote URL ${url}`);
  const child = spawn('npm', ['run', 'dev', '--', '--strictPort'], {
    cwd: process.cwd(),
    detached: process.platform !== 'win32',
    env: { ...process.env, FORCE_COLOR: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (await isReachable(url)) {
      return async () => {
        if (child.exitCode !== null) return;
        if (process.platform === 'win32') child.kill('SIGTERM');
        else process.kill(-child.pid, 'SIGTERM');
        await Promise.race([
          new Promise((resolveExit) => child.once('exit', resolveExit)),
          wait(2_000),
        ]);
      };
    }
    if (child.exitCode !== null) throw new Error(`Local server exited early:\n${output}`);
    await wait(250);
  }
  child.kill('SIGTERM');
  throw new Error(`Local server did not become ready:\n${output}`);
}

export function argument(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

export async function writeJson(path, value) {
  const output = resolve(path);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(value, null, 2)}\n`);
  return output;
}

export async function waitForState(page, state, timeout = 8_000) {
  await page.locator(`body[data-experience-state="${state}"]`).waitFor({ timeout });
}

export async function enterExperience(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.locator('[data-testid="enter-button"]:not([disabled])').waitFor({ timeout: 120_000 });
  await page.locator('[data-testid="enter-button"]').click();
  await waitForState(page, 'idle');
}

export async function completeCast(page) {
  await page.mouse.down();
  await waitForState(page, 'charged', 6_000);
  await page.waitForTimeout(100);
  await page.mouse.up();
  await waitForState(page, 'complete', 8_000);
}

export async function resetCast(page) {
  await page.locator('[data-testid="reset-button"]').click();
  await waitForState(page, 'idle', 3_000);
}
