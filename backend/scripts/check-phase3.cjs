const fs = require('node:fs');
const path = require('node:path');

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

const required = [
  'src/modules/catalog/catalog.controller.ts',
  'src/modules/catalog/catalog.service.ts',
  'src/modules/catalog/admin-catalog.controller.ts',
  'src/modules/catalog/admin-catalog.service.ts',
  'src/modules/inventory/inventory.controller.ts',
  'src/modules/inventory/inventory.service.ts',
  'prisma/seed.ts',
  'prisma/data/altura-catalog.json',
  'docs/CATALOG_API.md',
  'docs/PHASE3_REPORT.md',
];
required.forEach(requireFile);

const schema = text('prisma/schema.prisma');
for (const needle of [
  'featured         Boolean',
  'position         Int',
  'colorName  String?',
  'isPrimary  Boolean',
  '@@unique([productId, url])',
  'model InventoryMovement',
]) {
  if (!schema.includes(needle)) errors.push(`Prisma schema missing: ${needle}`);
}

const catalogController = text('src/modules/catalog/catalog.controller.ts');
for (const route of ["@Get('products')", "@Get('products/:slug')", "@Get('categories')", "@Get('collections')"]) {
  if (!catalogController.includes(route)) errors.push(`Public catalog route missing: ${route}`);
}

const adminController = text('src/modules/catalog/admin-catalog.controller.ts');
for (const marker of ['JwtAuthGuard', 'RolesGuard', '@Roles(UserRole.ADMIN)']) {
  if (!adminController.includes(marker)) errors.push(`Admin catalog security marker missing: ${marker}`);
}

const inventory = text('src/modules/inventory/inventory.service.ts');
for (const marker of ['reservedQuantity', 'availableQuantity', 'reserve(', 'releaseReservation(', 'commitReservation(', '$executeRaw']) {
  if (!inventory.includes(marker)) errors.push(`Inventory safety feature missing: ${marker}`);
}

const jsonPath = requireFile('prisma/data/altura-catalog.json');
if (fs.existsSync(jsonPath)) {
  const catalog = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const products = catalog.products || [];
  const active = products.filter((product) => product.status === 'ACTIVE');
  const activeColorways = active.reduce((sum, product) => sum + product.colors.length, 0);
  const images = products.reduce((sum, product) => sum + product.images.length, 0);
  const variants = products.reduce((sum, product) => sum + product.colors.length * product.sizes.length, 0);
  const activeVariants = active.reduce((sum, product) => sum + product.colors.length * product.sizes.length, 0);

  const expected = { products: 20, active: 9, activeColorways: 21, images: 196, variants: 192, activeVariants: 87 };
  const actual = { products: products.length, active: active.length, activeColorways, images, variants, activeVariants };
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) errors.push(`Catalog ${key}: expected ${value}, found ${actual[key]}`);
  }

  const urls = new Set();
  for (const product of products) {
    for (const image of product.images) {
      if (!image.url.startsWith('/products/')) errors.push(`Non-local product image URL: ${image.url}`);
      const uniqueKey = `${product.slug}:${image.url}`;
      if (urls.has(uniqueKey)) errors.push(`Duplicate product image: ${uniqueKey}`);
      urls.add(uniqueKey);
    }
  }
}

if (errors.length) {
  console.error('Phase 3 check FAILED:');
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}

console.log('Phase 3 static checks passed.');
console.log('Catalog snapshot: 20 products / 9 active / 21 active colorways / 192 variants / 196 images.');
