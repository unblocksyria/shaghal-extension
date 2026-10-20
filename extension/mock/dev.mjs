// One command, two processes: the mock API and the WXT dev build. Ctrl+C
// (or a stop signal) stops both, including the process tree (WXT spawns
// children of its own). Site links work from a dev build because the child
// gets the real site base, and the API base is pinned to the mock so an
// inherited WXT_API_BASE can never point this build at the live API.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import readline from 'node:readline';

const here = path.dirname(fileURLToPath(import.meta.url));
const isWindows = process.platform === 'win32';
const MOCK_API = 'http://localhost:8787';

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
  env: { ...process.env, WXT_SITE_BASE: 'https://unblocksyria.com', WXT_API_BASE: MOCK_API },
  detached: !isWindows,
});

const mock = spawn(process.execPath, [path.join(here, 'server.mjs')], { stdio: 'inherit' });

// One shutdown path for every way the run can end, guarded so our own kills
// and double signals cannot race each other.
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  console.log('\n[mock] stopping the mock and the dev build.');
  treeKill(wxtBin);
  treeKill(mock);
  process.exit(code);
}

// Ctrl+C: readline gives us the signal on Windows too. SIGINT and SIGTERM
// cover an IDE stop button or a plain kill on every platform.
readline.createInterface({ input: process.stdin, terminal: true }).on('SIGINT', () => stop(0));
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

for (const child of [wxtBin, mock]) {
  child.on('exit', (code, signal) => {
    if (stopping) return; // we killed it
    const how = signal ? `signal ${signal}` : `code ${code}`;
    console.error(`[mock] one process exited (${how}); stopping the other.`);
    stop(code ?? 1);
  });
}
