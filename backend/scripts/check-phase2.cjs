const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function fail(message) {
  console.error(`[FAIL] ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`[PASS] ${message}`);
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const tsFiles = walk(path.join(root, 'src')).filter((file) => file.endsWith('.ts'));
let syntaxErrors = 0;
for (const file of tsFiles) {
  const sourceText = fs.readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(file, sourceText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  for (const diagnostic of sourceFile.parseDiagnostics) {
    syntaxErrors += 1;
    const loc = sourceFile.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
    console.error(
      `${path.relative(root, file)}:${loc.line + 1}:${loc.character + 1} TS${diagnostic.code} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`,
    );
  }
}

if (syntaxErrors === 0) pass(`${tsFiles.length} TypeScript files parse without syntax errors`);
else fail(`${syntaxErrors} TypeScript syntax error(s)`);

const schema = fs.readFileSync(path.join(root, 'prisma', 'schema.prisma'), 'utf8');
if ((schema.match(/{/g) ?? []).length === (schema.match(/}/g) ?? []).length) {
  pass('Prisma schema brace balance');
} else {
  fail('Prisma schema brace balance');
}

const schemaMarkers = [
  'model User {',
  'authVersion',
  'model RefreshToken {',
  'createdByIp',
  'revokedByIp',
  'lastUsedAt',
  'model Address {',
];
for (const marker of schemaMarkers) {
  if (!schema.includes(marker)) fail(`Missing Prisma marker: ${marker}`);
}
if (!process.exitCode) pass('Phase 2 Prisma markers present');

const authController = fs.readFileSync(path.join(root, 'src', 'modules', 'auth', 'auth.controller.ts'), 'utf8');
const usersController = fs.readFileSync(path.join(root, 'src', 'modules', 'users', 'users.controller.ts'), 'utf8');
const requiredAuthRoutes = ["@Post('register')", "@Post('login')", "@Post('refresh')", "@Post('logout')", "@Post('logout-all')", "@Get('me')"];
const requiredUserRoutes = ["@Get()", "@Patch()", "@Post('password')", "@Get('addresses')", "@Post('addresses')", "@Get('addresses/:addressId')", "@Patch('addresses/:addressId')", "@Delete('addresses/:addressId')"];

for (const route of requiredAuthRoutes) if (!authController.includes(route)) fail(`Missing auth route: ${route}`);
for (const route of requiredUserRoutes) if (!usersController.includes(route)) fail(`Missing users route: ${route}`);
if (!process.exitCode) pass('Expected Phase 2 HTTP routes present');

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (!packageJson.dependencies?.['@nestjs/jwt']) fail('@nestjs/jwt dependency missing');
else pass('@nestjs/jwt dependency declared');

if (!process.exitCode) {
  console.log('\nALTURA Phase 2 static checks passed.');
}
