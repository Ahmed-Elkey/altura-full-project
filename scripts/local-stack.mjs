import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backend = path.join(root, 'backend');
const command = process.argv[2] || 'check';
if (!['check', 'build', 'start', 'prisma-status'].includes(command)) {
  throw new Error('Use check, build, start or prisma-status. This script never installs, migrates or seeds.');
}
const readProfile = (file) => existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {};
const backendConfig = readProfile(path.join(backend, '.env'));
const localConfig = readProfile(path.join(backend, '.env.portfolio.local'));
const privateConfig = { ...backendConfig, ...localConfig, ...process.env };

function parsePgpassLine(line) {
  if (!line || /^\s*#/.test(line)) return null;
  const fields = [];
  let field = '';
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (character === '\\' && index + 1 < line.length) {
      field += line[++index];
    } else if (character === ':') {
      fields.push(field);
      field = '';
    } else {
      field += character;
    }
  }
  fields.push(field);
  return fields.length === 5 ? fields : null;
}

function databaseUrlFromPgpass(file) {
  let contents;
  try { contents = readFileSync(file, 'utf8'); }
  catch { throw new Error('The configured local PostgreSQL credential file is unavailable or unreadable. Check backend/.env.portfolio.local.'); }
  const matches = contents.split(/\r?\n/).map(parsePgpassLine).filter((entry) =>
    entry && entry[0] === '127.0.0.1' && entry[1] === '5433' &&
    (entry[2] === 'altura_dev' || entry[2] === '*') && entry[3] && entry[4],
  );
  if (matches.length !== 1) {
    throw new Error(matches.length
      ? 'The local PostgreSQL credential file has multiple matching entries; keep one entry for 127.0.0.1:5433/altura_dev.'
      : 'The local PostgreSQL credential file has no entry for 127.0.0.1:5433/altura_dev.');
  }
  const [, , , username, password] = matches[0];
  const url = new URL('postgresql://127.0.0.1:5433/altura_dev?schema=public');
  url.username = username;
  url.password = password;
  return url.toString();
}

const explicitDatabaseUrl = process.env.DATABASE_URL ?? localConfig.DATABASE_URL;
const pgpassFile = process.env.ALTURA_PGPASS_FILE ?? localConfig.ALTURA_PGPASS_FILE;
const configuredDatabaseUrl = explicitDatabaseUrl ?? (pgpassFile ? databaseUrlFromPgpass(pgpassFile) : undefined);
if (!configuredDatabaseUrl) throw new Error('Set DATABASE_URL or ALTURA_PGPASS_FILE in the private backend/.env.portfolio.local profile.');
privateConfig.DATABASE_URL = configuredDatabaseUrl;
const secretValues = Object.entries(privateConfig).filter(([key, value]) => /SECRET|PASSWORD|TOKEN|DATABASE_URL|API_KEY/.test(key) && value?.length > 5).map(([, value]) => value);
let database;
try { database = new URL(configuredDatabaseUrl); } catch { throw new Error('The configured local DATABASE_URL is invalid. Check the private local profile.'); }
secretValues.push(decodeURIComponent(database.password));
if (!['postgresql:', 'postgres:'].includes(database.protocol) || database.hostname !== '127.0.0.1' || database.port !== '5433' || database.pathname !== '/altura_dev' || [...database.searchParams].some(([key, value]) => key !== 'schema' || value !== 'public')) {
  throw new Error('Refused database target: only 127.0.0.1:5433/altura_dev with the public schema is allowed.');
}
if (!database.username || !database.password || /REPLACE_|YOUR_/i.test(database.username + database.password)) {
  throw new Error('Replace the example database credential placeholders in your private local profile.');
}
for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
  if (!privateConfig[key] || privateConfig[key].length < 32) throw new Error(`${key} needs a private value of at least 32 characters. No environment file was changed.`);
}
if (!existsSync(path.join(root, 'node_modules/next')) || !existsSync(path.join(backend, 'node_modules/@prisma/client'))) {
  throw new Error('Installed frontend/backend dependencies are required. Install deliberately using the lockfiles; this launcher does not install packages.');
}
const env = {
  ...privateConfig,
  DATABASE_URL: database.toString(),
  HOST: '127.0.0.1', PORT: '4000', API_PREFIX: 'api/v1', TRUST_PROXY: 'false',
  FRONTEND_ORIGIN: 'http://127.0.0.1:3100',
  DEFAULT_COUNTRY: 'EG', DEFAULT_CURRENCY: 'EGP', PAYMENT_MODE: 'mock', STORAGE_MODE: 'local',
  RATE_LIMIT_ENABLED: privateConfig.RATE_LIMIT_ENABLED || 'true',
  NEXT_PUBLIC_API_URL: 'http://127.0.0.1:4000/api/v1', NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3100', STOREFRONT_MODE: 'local',
};
function redact(value) {
  let text = String(value);
  for (const secret of secretValues) if (secret) text = text.split(secret).join('[redacted]');
  return text.replace(/postgres(?:ql)?:\/\/[^\s@]+@/g, 'postgresql://[redacted]@');
}
const children = new Set();
function run(cwd, args, nodeEnv) {
  const child = spawn(process.execPath, args, { cwd, env: { ...env, NODE_ENV: nodeEnv }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(child);
  // Keep complete lines together so a secret split between stream chunks stays redacted.
  for (const stream of [child.stdout, child.stderr]) {
    let pending = '';
    stream.on('data', (data) => {
      pending += data.toString();
      const lines = pending.split(/\r?\n/); pending = lines.pop();
      for (const line of lines) process.stdout.write(redact(line) + '\n');
    });
    stream.on('end', () => { if (pending) process.stdout.write(redact(pending) + '\n'); });
  }
  const completed = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => { children.delete(child); code === 0 ? resolve() : reject(new Error(`Local process exited with code ${code}.`)); });
  });
  return { child, completed };
}
function stop() { for (const child of children) child.kill(); }
process.on('SIGINT', () => { stop(); process.exitCode = 0; });
process.on('SIGTERM', () => { stop(); process.exitCode = 0; });
async function databaseCheck(requireSchema) {
  const require = createRequire(path.join(backend, 'package.json'));
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  try {
    const [target] = await db.$queryRaw`SELECT host(inet_server_addr()) AS host, inet_server_port() AS port, current_database() AS name`;
    if (target.host !== '127.0.0.1' || target.port !== 5433 || target.name !== 'altura_dev') throw new Error('Connected server target does not match the local profile.');
    if (requireSchema) {
      const [tables] = await db.$queryRaw`SELECT to_regclass('public."Product"')::text AS product, to_regclass('public."Order"')::text AS orders`;
      if (!tables.product || !tables.orders) throw new Error('Database schema is missing. Review migrations separately; this script does not apply them.');
      const count = await db.product.count({ where: { status: 'ACTIVE' } });
      console.log(`Database connected: 127.0.0.1:5433/altura_dev; ${count} active products. No fixture records were inserted.`);
      if (!count) console.log('Catalog is empty. Review a bounded local fixture setup separately.');
    }
  } finally { await db.$disconnect(); }
}
async function available(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () => reject(new Error(`127.0.0.1:${port} is occupied. Stop the owning local application first.`)));
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}
async function main() {
  console.log('Safe portfolio profile: frontend 127.0.0.1:3100, API 127.0.0.1:4000, EG/EGP, local mock payments, backend development mode.');
  if (command === 'build') {
    await run(backend, ['node_modules/@nestjs/cli/bin/nest.js', 'build'], 'development').completed;
    await run(root, ['node_modules/next/dist/bin/next', 'build'], 'production').completed;
    writeFileSync(path.join(root, '.next/altura-local-profile.json'), JSON.stringify({
      buildId: readFileSync(path.join(root, '.next/BUILD_ID'), 'utf8').trim(),
      apiOrigin: env.NEXT_PUBLIC_API_URL, siteOrigin: env.NEXT_PUBLIC_SITE_URL,
    }));
    return;
  }
  await databaseCheck(command !== 'prisma-status');
  if (command === 'check') return;
  if (command === 'prisma-status') {
    await run(backend, ['node_modules/prisma/build/index.js', 'migrate', 'status'], 'development').completed;
    return;
  }
  if (!existsSync(path.join(backend, 'dist/src/main.js')) || !existsSync(path.join(root, '.next/BUILD_ID'))) {
    throw new Error('Compiled outputs are missing. Run npm run portfolio:build first.');
  }
  // Prevent silently serving a stale bundle built with another public origin.
  const profilePath = path.join(root, '.next/altura-local-profile.json');
  if (!existsSync(profilePath)) throw new Error('Build provenance is missing. Run npm run portfolio:build for the canonical local origins.');
  const builtProfile = JSON.parse(readFileSync(profilePath, 'utf8'));
  if (builtProfile.buildId !== readFileSync(path.join(root, '.next/BUILD_ID'), 'utf8').trim() || builtProfile.apiOrigin !== env.NEXT_PUBLIC_API_URL || builtProfile.siteOrigin !== env.NEXT_PUBLIC_SITE_URL) throw new Error('Rebuild through portfolio:build for the canonical local origins.');
  await available(4000); await available(3100);
  const api = run(backend, ['dist/src/main.js'], 'development');
  // Attach a handler immediately, even while waiting for readiness.
  let apiFailure;
  api.completed.catch((error) => { apiFailure = error; });
  let ready = false;
  for (let attempt = 0; attempt < 60 && !apiFailure; attempt++) {
    try {
      const response = await fetch('http://127.0.0.1:4000/api/v1/health', { signal: AbortSignal.timeout(1000) });
      ready = response.ok && (await response.json()).database === 'connected';
    } catch { /* startup may still be in progress */ }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw apiFailure || new Error('Backend did not become ready. PostgreSQL must be started separately.');
  const frontend = run(root, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '-p', '3100'], 'production');
  console.log('Open http://127.0.0.1:3100. Ctrl+C stops this launcher\'s applications. PostgreSQL remains separately managed.');
  await Promise.race([api.completed, frontend.completed]);
  stop();
}
main().catch((error) => { stop(); console.error(redact(error.message)); process.exitCode = 1; });
