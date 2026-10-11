const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const errors = [];

function requireFile(relative) {
  const full = path.join(root, relative);
  if (!fs.existsSync(full)) errors.push(`Missing file: ${relative}`);
  return full;
}

function text(relative) {
  const full = requireFile(relative);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

[
  'src/common/auth/optional-jwt-auth.guard.ts',
  'src/common/security/guest-session.service.ts',
  'src/modules/carts/carts.controller.ts',
  'src/modules/carts/carts.service.ts',
  'src/modules/wishlist/wishlist.controller.ts',
  'src/modules/wishlist/wishlist.service.ts',
  'src/modules/commerce-session/commerce-session.controller.ts',
  'src/modules/commerce-session/commerce-session.service.ts',
  'docs/CART_WISHLIST_API.md',
  'docs/PHASE4_REPORT.md',
].forEach(requireFile);

const schema = text('prisma/schema.prisma');
for (const marker of [
  'model Cart {',
  'sessionId String?    @unique',
  'model CartItem {',
  '@@unique([cartId, variantId])',
  'model Wishlist {',
  'userId    String?  @unique',
  'sessionId String?  @unique',
  'expiresAt DateTime?',
  '@@unique([wishlistId, productId])',
]) {
  if (!schema.includes(marker)) errors.push(`Prisma Phase 4 marker missing: ${marker}`);
}

const cartController = text('src/modules/carts/carts.controller.ts');
for (const route of [
  "@Get()",
  "@Post('items')",
  "@Patch('items/:itemId')",
  "@Delete('items/:itemId')",
  "@Delete()",
  "@Post('validate')",
]) {
  if (!cartController.includes(route)) errors.push(`Cart route missing: ${route}`);
}

const wishlistController = text('src/modules/wishlist/wishlist.controller.ts');
for (const route of ["@Get()", "@Post('items')", "@Delete('items/:productId')"]) {
  if (!wishlistController.includes(route)) errors.push(`Wishlist route missing: ${route}`);
}

const mergeController = text('src/modules/commerce-session/commerce-session.controller.ts');
for (const marker of ["@Post('merge')", 'JwtAuthGuard', 'guestSession.clear']) {
  if (!mergeController.includes(marker)) errors.push(`Commerce merge marker missing: ${marker}`);
}

const cartService = text('src/modules/carts/carts.service.ts');
for (const marker of [
  'ProductStatus.ACTIVE',
  'availableQuantity',
  'MAX_LINE_QUANTITY',
  'PRODUCT_UNAVAILABLE',
  'VARIANT_UNAVAILABLE',
  'OUT_OF_STOCK',
  'QUANTITY_REDUCED',
]) {
  if (!cartService.includes(marker)) errors.push(`Cart safety marker missing: ${marker}`);
}

const mergeService = text('src/modules/commerce-session/commerce-session.service.ts');
for (const marker of [
  'this.prisma.$transaction',
  'CartStatus.ABANDONED',
  'availableQuantity',
  'skipDuplicates: true',
]) {
  if (!mergeService.includes(marker)) errors.push(`Merge integrity marker missing: ${marker}`);
}

const guestSession = text('src/common/security/guest-session.service.ts');
for (const marker of ['randomBytes(32)', "createHash('sha256')", "httpOnly: true", "sameSite: 'lax'"]) {
  if (!guestSession.includes(marker)) errors.push(`Guest session security marker missing: ${marker}`);
}

for (const file of walk(path.join(root, 'src')).filter((file) => file.endsWith('.ts'))) {
  const sourceText = fs.readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(file, sourceText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  for (const diagnostic of sourceFile.parseDiagnostics) {
    const loc = sourceFile.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
    errors.push(
      `${path.relative(root, file)}:${loc.line + 1}:${loc.character + 1} TS${diagnostic.code} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`,
    );
  }
}

if (errors.length) {
  console.error('Phase 4 check FAILED:');
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}

console.log('Phase 4 static checks passed.');
console.log('Guest/customer cart + wishlist + transactional merge are present.');
