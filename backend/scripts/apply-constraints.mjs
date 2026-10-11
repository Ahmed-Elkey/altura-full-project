// One-off local helper: applies backend/prisma/db-constraints.sql via Prisma,
// one statement at a time (prepared statements reject multi-command strings).
// Usage: DATABASE_URL=... node scripts/apply-constraints.mjs
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = readFileSync(join(root, 'prisma', 'db-constraints.sql'), 'utf8');

function splitStatements(sql) {
  const withoutComments = sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
  const statements = [];
  let current = '';
  let inDollarQuote = false;
  for (const line of withoutComments.split('\n')) {
    current += `${line}\n`;
    const markers = (line.match(/\$\$/g) || []).length;
    if (markers % 2 === 1) inDollarQuote = !inDollarQuote;
    if (!inDollarQuote && line.trimEnd().endsWith(';')) {
      if (current.trim()) statements.push(current);
      current = '';
    }
  }
  if (current.trim()) statements.push(current);
  return statements;
}

const prisma = new PrismaClient();
try {
  const statements = splitStatements(raw);
  for (const [index, statement] of statements.entries()) {
    await prisma.$executeRawUnsafe(statement);
    console.log(`statement ${index + 1}/${statements.length} ok`);
  }
  console.log('db-constraints.sql applied successfully');
} finally {
  await prisma.$disconnect();
}
