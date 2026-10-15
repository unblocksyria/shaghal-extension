// One command, two processes: the mock API and the WXT dev build. Ctrl+C
// stops both, including the process tree (WXT spawns children of its own).
// Site links work from a dev build because the child gets the real site base;
// the API base stays the dev default of localhost:8787 (src/lib/config.ts).
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import readline from 'node:readline';

const here = path.dirname(fileURLToPath(import.meta.url));
const isWindows = process.platform === 'win32';

function treeKill(child) {
  // Windows needs taskkill to reach the whole tree; elsewhere the process
  // group (negative pid) covers the command and its children.
  if (!child.pid) return;
  if (isWindows) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
  }
}

const wxtCommand = isWindows ? 'cmd' : 'npx';
const wxtArgs = isWindows ? ['/c', 'npx', 'wxt'] : ['wxt'];
const wxtBin = spawn(wxtCommand, wxtArgs, {
  stdio: 'inherit',
  env: { ...process.env, WXT_SITE_BASE: 'https://unblocksyria.com' },
  detached: !isWindows,
});

const mock = spawn(process.execPath, [path.join(here, 'server.mjs')], { stdio: 'inherit' });

// Ctrl+C: readline gives us the signal on Windows too, then the trees die.
readline.createInterface({ input: process.stdin, terminal: true }).on('SIGINT', () => {
  console.log('\n[mock] stopping the mock and the dev build.');
  treeKill(wxtBin);
  treeKill(mock);
  process.exit(0);
});

for (const child of [wxtBin, mock]) {
  child.on('exit', (code, signal) => {
    if (signal) return; // we killed it
    console.error(`[mock] one process exited with code ${code}; stopping the other.`);
    treeKill(child === mock ? wxtBin : mock);
    process.exit(code ?? 1);
  });
}
