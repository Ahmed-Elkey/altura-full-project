#!/usr/bin/env node
// Start a local development server independently of the invoking terminal.
import { spawn } from 'node:child_process';
import { mkdirSync, openSync, closeSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2] || 3100);
const production = process.argv.includes('--production');
const mode = production ? 'production' : 'dev';
const logs = path.join(root, '.hero-build');
const origin = `http://127.0.0.1:${port}`;
async function healthy() {
  try {
    const response = await fetch(`${origin}/api/health?probe=liveness`, { signal: AbortSignal.timeout(2000) });
    const health = await response.json();
    return response.ok && health.service === 'altura-storefront' && health.liveness === 'ok';
  } catch { return false; }
}
async function main() {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Use a port between 1024 and 65535.');
  const available = await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', error => error.code === 'EADDRINUSE' ? resolve(false) : reject(error));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });
  if (!available) {
    if (await healthy()) { console.log(`ALTURA is already running at ${origin}; no second server was started.`); return; }
    throw new Error(`Port ${port} is occupied by another or unavailable application. No process was stopped or started.`);
  }
  if (production && !existsSync(path.join(root, '.next', 'BUILD_ID'))) throw new Error('Run npm run build before starting the production preview.');
  mkdirSync(logs, { recursive: true });
  const log = openSync(path.join(logs, `${mode}.log`), 'a');
  const child = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), production ? 'start' : 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: root, detached: true, stdio: ['ignore', log, log],
    env: { ...process.env, NODE_ENV: production ? 'production' : 'development', NEXT_PUBLIC_API_URL: 'http://127.0.0.1:4000/api/v1', NEXT_PUBLIC_SITE_URL: origin, STOREFRONT_MODE: 'local' },
  });
  closeSync(log);
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
  writeFileSync(path.join(logs, `${mode}.pid`), String(child.pid));
  child.unref();
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await healthy()) { console.log(`ALTURA ready at ${origin}. Mode: ${production ? 'production preview' : 'development (.next-dev)' }. Log: ${path.join(logs, `${mode}.log`)}`); return; }
    try { process.kill(child.pid, 0); } catch { throw new Error(`The development server exited. Check ${path.join(logs, `${mode}.log`)}.`); }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Server startup has not become ready. Check ${path.join(logs, `${mode}.log`)} before trying again.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
