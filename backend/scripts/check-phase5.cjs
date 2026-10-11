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
  'src/modules/checkout/checkout.controller.ts',
  'src/modules/checkout/checkout.service.ts',
  'src/modules/checkout/dto/checkout-address.dto.ts',
  'src/modules/checkout/dto/checkout-quote.dto.ts',
  'src/modules/checkout/dto/place-order.dto.ts',
  'src/modules/orders/orders.controller.ts',
  'src/modules/orders/orders.service.ts',
  'src/modules/orders/order.presenter.ts',
  'src/modules/discounts/discounts.service.ts',
  'src/modules/shipping/shipping.service.ts',
  'docs/CHECKOUT_ORDERS_API.md',
  'docs/PHASE5_REPORT.md',
].forEach(requireFile);

const schema = text('prisma/schema.prisma');
for (const marker of [
  'idempotencyKey       String?     @unique',
  'idempotencyFingerprint String?',
  'sourceCartId         String?',
  'reservationExpiresAt DateTime?',
  'inventoryCommittedAt DateTime?',
  '@@index([status, reservationExpiresAt])',
]) {
  if (!schema.includes(marker)) errors.push(`Phase 5 Prisma marker missing: ${marker}`);
}

const checkoutController = text('src/modules/checkout/checkout.controller.ts');
for (const route of [
  "@Post('shipping-methods')",
  "@Post('quote')",
  "@Post('place-order')",
  "@Headers('idempotency-key')",
]) {
  if (!checkoutController.includes(route)) errors.push(`Checkout route missing: ${route}`);
}

const checkoutService = text('src/modules/checkout/checkout.service.ts');
for (const marker of [
  'Prisma.TransactionIsolationLevel.Serializable',
  'reservedQuantity',
  'idempotencyFingerprint',
  'CHECKOUT_RESERVATION_TTL',
  'ProductStatus.ACTIVE',
  'CartStatus.CONVERTED',
  'discountUsages',
  'reservationExpiresAt',
]) {
  if (!checkoutService.includes(marker)) errors.push(`Checkout safety marker missing: ${marker}`);
}

const ordersController = text('src/modules/orders/orders.controller.ts');
for (const route of [
  "@Post('guest/lookup')",
  "@Post('maintenance/release-expired')",
  '@Get()',
  "@Get(':orderNumber')",
]) {
  if (!ordersController.includes(route)) errors.push(`Order route missing: ${route}`);
}

const ordersService = text('src/modules/orders/orders.service.ts');
for (const marker of [
  'releaseExpiredReservations',
  'reservedQuantity',
  'OrderStatus.CANCELLED',
  'Prisma.TransactionIsolationLevel.Serializable',
]) {
  if (!ordersService.includes(marker)) errors.push(`Order reservation marker missing: ${marker}`);
}

const discountService = text('src/modules/discounts/discounts.service.ts');
for (const marker of [
  'DiscountType.PERCENTAGE',
  'DiscountType.FIXED_AMOUNT',
  'DiscountType.FREE_SHIPPING',
  'usageLimit',
  'perCustomerLimit',
]) {
  if (!discountService.includes(marker)) errors.push(`Discount marker missing: ${marker}`);
}

const shippingService = text('src/modules/shipping/shipping.service.ts');
for (const marker of ['countries: { has:', 'freeAbove', 'resolveMethod']) {
  if (!shippingService.includes(marker)) errors.push(`Shipping marker missing: ${marker}`);
}

const seed = text('prisma/seed.ts');
for (const marker of [
  'seedShippingConfiguration',
  'ALTURA Default Market',
  "code: 'standard'",
  "code: 'express'",
]) {
  if (!seed.includes(marker)) errors.push(`Seed shipping marker missing: ${marker}`);
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

const catalogPath = path.join(root, 'prisma/data/altura-catalog.json');
if (fs.existsSync(catalogPath)) {
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const active = catalog.products.filter((product) => product.status === 'ACTIVE');
  const colorways = active.reduce((sum, product) => sum + product.colors.length, 0);
  const variants = catalog.products.reduce(
    (sum, product) => sum + product.colors.length * product.sizes.length,
    0,
  );
  const images = catalog.products.reduce((sum, product) => sum + product.images.length, 0);
  if (catalog.products.length !== 20) errors.push(`Expected 20 catalog products, got ${catalog.products.length}`);
  if (active.length !== 9) errors.push(`Expected 9 active products, got ${active.length}`);
  if (colorways !== 21) errors.push(`Expected 21 active colorways, got ${colorways}`);
  if (variants !== 192) errors.push(`Expected 192 variants, got ${variants}`);
  if (images !== 196) errors.push(`Expected 196 images, got ${images}`);
}

if (errors.length) {
  console.error('Phase 5 check FAILED:');
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}

console.log('Phase 5 static checks passed.');
console.log('Checkout quoting, atomic reservation, idempotent order placement, order lookup/history, shipping, discounts, and reservation expiry maintenance are present.');
