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
  'src/modules/payments/payments.controller.ts',
  'src/modules/payments/payments.service.ts',
  'src/modules/payments/payment.types.ts',
  'src/modules/payments/payment-money.ts',
  'src/modules/payments/providers/mock-payment.provider.ts',
  'src/modules/payments/providers/stripe-payment.provider.ts',
  'src/modules/payments/providers/paymob-payment.provider.ts',
  'src/modules/payments/dto/initialize-payment.dto.ts',
  'src/modules/payments/dto/mock-payment-outcome.dto.ts',
  'docs/PAYMENTS_API.md',
  'docs/PHASE6_REPORT.md',
].forEach(requireFile);

const schema = text('prisma/schema.prisma');
for (const marker of [
  'PAYMENT_REVIEW',
  'idempotencyKey        String          @unique',
  'idempotencyFingerprint String',
  'activeAttemptKey      String?         @unique',
  'providerInitStartedAt DateTime?',
  'inventoryReleasedAt  DateTime?',
  'providerOrderId       String?',
  'providerTransactionId String?',
  'checkoutSecret        String?',
  'refundedAmount        Decimal',
  'lastWebhookAt         DateTime?',
  'model PaymentWebhookEvent',
  'eventType       String',
  'processingError String?',
  '@@unique([provider, externalEventId])',
]) {
  if (!schema.includes(marker)) errors.push(`Phase 6 Prisma marker missing: ${marker}`);
}

// Guard against a subtle Prisma failure that existed in the incoming Phase 5 archive:
// the same field name must never appear twice inside one model.
for (const match of schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
  const [, modelName, body] = match;
  const fields = new Map();
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) continue;
    const field = trimmed.split(/\s+/)[0];
    if (!/^[A-Za-z_]\w*$/.test(field)) continue;
    if (fields.has(field)) errors.push(`Duplicate Prisma field ${modelName}.${field}`);
    fields.set(field, true);
  }
}

for (const match of schema.matchAll(/enum\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
  const [, enumName, body] = match;
  const values = new Set();
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//')) continue;
    const value = trimmed.split(/\s+/)[0];
    if (!/^[A-Z_]\w*$/.test(value)) continue;
    if (values.has(value)) errors.push(`Duplicate Prisma enum value ${enumName}.${value}`);
    values.add(value);
  }
}

const main = text('src/main.ts');
for (const marker of ['rawBody: true', ".setVersion('0.7.0')"]) {
  if (!main.includes(marker)) errors.push(`Main bootstrap marker missing: ${marker}`);
}

const controller = text('src/modules/payments/payments.controller.ts');
for (const route of [
  "@Post('initialize')",
  "@Post('mock/:paymentId/complete')",
  "@Post('webhooks/stripe')",
  "@Post('webhooks/paymob')",
  "@Headers('stripe-signature')",
  "@Query('hmac')",
]) {
  if (!controller.includes(route)) errors.push(`Payment route missing: ${route}`);
}

const service = text('src/modules/payments/payments.service.ts');
for (const marker of [
  'Prisma.TransactionIsolationLevel.Serializable',
  'InventoryReason.PURCHASE',
  'PaymentStatus.PAID',
  'OrderStatus.CONFIRMED',
  'OrderStatus.PAYMENT_REVIEW',
  'providerAmountMismatch',
  'Duplicate successful payment detected',
  'createOrLoadWebhook',
  'idempotencyFingerprint',
  'activeAttemptKey',
  'providerInitStartedAt',
  'releaseReservedInventory',
  'inventoryReleasedAt',
]) {
  if (!service.includes(marker)) errors.push(`Payment safety marker missing: ${marker}`);
}

const stripe = text('src/modules/payments/providers/stripe-payment.provider.ts');
for (const marker of [
  'https://api.stripe.com/v1/payment_intents',
  "createHmac('sha256'",
  'timingSafeEqual',
  "'Idempotency-Key'",
  'payment_intent.succeeded',
  'charge.refunded',
]) {
  if (!stripe.includes(marker)) errors.push(`Stripe marker missing: ${marker}`);
}

const paymob = text('src/modules/payments/providers/paymob-payment.provider.ts');
for (const marker of [
  '/v1/intention/',
  'PAYMOB_PAYMENT_METHOD_IDS',
  "createHmac('sha512'",
  'obj.amount_cents',
  'obj.is_standalone_payment',
  'sourceData.sub_type',
  'providerOrderId',
]) {
  if (!paymob.includes(marker)) errors.push(`Paymob marker missing: ${marker}`);
}

const env = text('src/common/config/env.validation.ts');
for (const marker of [
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PUBLISHABLE_KEY',
  'PAYMOB_SECRET_KEY',
  'PAYMOB_HMAC_SECRET',
  'PAYMOB_PAYMENT_METHOD_IDS',
  'PAYMOB_NOTIFICATION_URL',
]) {
  if (!env.includes(marker)) errors.push(`Payment environment marker missing: ${marker}`);
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
  console.error('Phase 6 check FAILED:');
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}

const tsFiles = walk(path.join(root, 'src')).filter((file) => file.endsWith('.ts')).length;
console.log('Phase 6 static checks passed.');
console.log(`${tsFiles} TypeScript source files parsed with no syntax diagnostics.`);
console.log('Payment initialization, provider adapters, verified webhooks, idempotent event storage, atomic inventory commit, payment review safeguards, and refund-state ingestion are present.');
