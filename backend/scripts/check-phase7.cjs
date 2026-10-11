const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const backendRoot = path.resolve(__dirname, '..');
const storeRoot = path.resolve(backendRoot, '..');
const errors = [];

function requireFile(root, relative) {
  const full = path.join(root, relative);
  if (!fs.existsSync(full)) errors.push(`Missing file: ${path.relative(storeRoot, full)}`);
  return full;
}
function text(root, relative) {
  const file = requireFile(root, relative);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const backendFiles = [
  'src/modules/admin/admin.module.ts',
  'src/modules/admin/admin.controller.ts',
  'src/modules/admin/admin.service.ts',
  'src/modules/admin/dto/list-admin-orders-query.dto.ts',
  'src/modules/admin/dto/list-admin-customers-query.dto.ts',
  'src/modules/admin/dto/update-customer-status.dto.ts',
  'src/modules/admin/dto/update-customer-role.dto.ts',
  'src/modules/admin/dto/update-order-workflow.dto.ts',
  'src/modules/admin/dto/update-order-note.dto.ts',
  'src/modules/admin/dto/create-discount.dto.ts',
  'src/modules/admin/dto/update-discount.dto.ts',
  'src/modules/admin/dto/list-payment-review-query.dto.ts',
  'docs/ADMIN_API.md',
  'docs/PHASE7_REPORT.md',
];
backendFiles.forEach((file) => requireFile(backendRoot, file));

const frontendFiles = [
  'components/StoreChrome.tsx',
  'components/admin/AdminAuthProvider.tsx',
  'components/admin/AdminShell.tsx',
  'components/admin/AdminUI.tsx',
  'lib/admin-format.ts',
  'app/admin/layout.tsx',
  'app/admin/login/page.tsx',
  'app/admin/page.tsx',
  'app/admin/orders/page.tsx',
  'app/admin/orders/[orderNumber]/page.tsx',
  'app/admin/products/page.tsx',
  'app/admin/products/[productId]/page.tsx',
  'app/admin/inventory/page.tsx',
  'app/admin/customers/page.tsx',
  'app/admin/customers/[userId]/page.tsx',
  'app/admin/discounts/page.tsx',
  'app/admin/payments/page.tsx',
];
frontendFiles.forEach((file) => requireFile(storeRoot, file));

const appModule = text(backendRoot, 'src/app.module.ts');
if (!appModule.includes('AdminModule')) errors.push('AdminModule is not wired into AppModule');

const main = text(backendRoot, 'src/main.ts');
if (!main.includes(".setVersion('0.7.0')")) errors.push('API version is not 0.7.0');

const controller = text(backendRoot, 'src/modules/admin/admin.controller.ts');
for (const marker of [
  "@Get('dashboard')",
  "@Get('orders')",
  "@Get('orders/:orderNumber')",
  "@Patch('orders/:orderNumber/workflow')",
  "@Patch('orders/:orderNumber/note')",
  "@Get('customers')",
  "@Patch('customers/:userId/status')",
  "@Patch('customers/:userId/role')",
  "@Get('discounts')",
  "@Post('discounts')",
  "@Get('payments/review')",
]) {
  if (!controller.includes(marker)) errors.push(`Admin route missing: ${marker}`);
}

const service = text(backendRoot, 'src/modules/admin/admin.service.ts');
for (const marker of [
  'PAYMENT_REVIEW',
  'Unsafe admin transition',
  'Add shipment tracking before marking the order as shipped',
  'You cannot remove your own ADMIN role',
  'USER_STATUS_UPDATED',
  'USER_ROLE_UPDATED',
  'DISCOUNT_CREATED',
  'processingError: { not: null }',
  'netRevenue30d',
]) {
  if (!service.includes(marker)) errors.push(`Admin safety/feature marker missing: ${marker}`);
}

const refreshCookie = text(backendRoot, 'src/common/security/refresh-cookie.service.ts');
if (!refreshCookie.includes('return false;')) {
  errors.push('Raw refresh tokens must not be exposed in auth response JSON');
}

if (!main.includes('localhost:(?:300[0-9]|3010)')) {
  errors.push('Development CORS does not account for the storefront launcher port range');
}

const authProvider = text(storeRoot, 'components/admin/AdminAuthProvider.tsx');
for (const marker of [
  '/auth/refresh',
  '/auth/login',
  'accessToken.current',
  'payload.user.role !== "ADMIN"',
]) {
  if (!authProvider.includes(marker)) errors.push(`Admin auth marker missing: ${marker}`);
}
const commerceApi = text(storeRoot, 'lib/commerce-api.ts');
if (!commerceApi.includes('credentials: "include"')) {
  errors.push('Commerce API transport must include refresh/session cookies');
}
if (authProvider.includes('localStorage') || authProvider.includes('sessionStorage')) {
  errors.push('Admin access token must not be persisted in localStorage/sessionStorage');
}

const paymentPage = text(storeRoot, 'app/admin/payments/page.tsx');
if (paymentPage.includes('Mark as Paid') || paymentPage.includes('mark as paid')) {
  errors.push('Payment Review UI contains an unsafe generic Mark as Paid action');
}
if (!paymentPage.includes('No blind overrides')) errors.push('Payment Review safety notice missing');

const storeChrome = text(storeRoot, 'components/StoreChrome.tsx');
if (!storeChrome.includes('pathname?.startsWith("/admin")')) errors.push('Store chrome is not isolated from admin routes');

const rootTsConfig = JSON.parse(text(storeRoot, 'tsconfig.json'));
if (!Array.isArray(rootTsConfig.exclude) || !rootTsConfig.exclude.includes('backend')) {
  errors.push('Frontend tsconfig must exclude the independent backend project');
}

const css = text(storeRoot, 'app/globals.css');
for (const marker of ['.admin-shell', '.admin-sidebar', '.admin-page-header', '.admin-login-page', '.admin-status']) {
  if (!css.includes(marker)) errors.push(`Admin design-system selector missing: ${marker}`);
}

const schema = text(backendRoot, 'prisma/schema.prisma');
for (const match of schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
  const [, modelName, body] = match;
  const fields = new Set();
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) continue;
    const field = trimmed.split(/\s+/)[0];
    if (!/^[A-Za-z_]\w*$/.test(field)) continue;
    if (fields.has(field)) errors.push(`Duplicate Prisma field ${modelName}.${field}`);
    fields.add(field);
  }
}

for (const file of [
  ...walk(path.join(backendRoot, 'src')).filter((f) => f.endsWith('.ts')),
  ...frontendFiles.map((f) => path.join(storeRoot, f)).filter((f) => /\.tsx?$/.test(f)),
]) {
  const sourceText = fs.readFileSync(file, 'utf8');
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file, sourceText, ts.ScriptTarget.ES2022, true, kind);
  for (const diagnostic of sourceFile.parseDiagnostics) {
    const loc = sourceFile.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
    errors.push(`${path.relative(storeRoot, file)}:${loc.line + 1}:${loc.character + 1} TS${diagnostic.code} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`);
  }
}

if (errors.length) {
  console.error('Phase 7 check FAILED:');
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}

console.log('Phase 7 static checks passed.');
console.log('Admin API, role boundaries, payment-review safeguards, in-memory access token handling, storefront/admin chrome isolation, and ALTURA Studio routes are present.');
