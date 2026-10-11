import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const launcher = fileURLToPath(new URL('./start-dev-detached.mjs', import.meta.url));
function run(port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [launcher, String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', value => { output += value; });
    child.stderr.on('data', value => { output += value; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, output }));
  });
}
test('launcher refuses an occupied port without spawning a duplicate server', async () => {
  const server = http.createServer((_request, response) => { response.writeHead(503, { Connection: 'close' }); response.end(); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const result = await run(server.address().port);
    assert.equal(result.code, 1);
    assert.match(result.output, /occupied/i);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
