/* Bascule le provider de la base dans prisma/schema.prisma.
   Prisma exige un littéral : on réécrit donc la ligne.
     node scripts/use-db.js postgresql
     node scripts/use-db.js sqlite                                        */
import fs from 'node:fs';

const target = (process.argv[2] || '').toLowerCase();
const ALLOWED = ['sqlite', 'postgresql', 'mysql'];
if (!ALLOWED.includes(target)) {
  console.error('Usage : node scripts/use-db.js <' + ALLOWED.join('|') + '>');
  process.exit(1);
}

const file = 'prisma/schema.prisma';
const src = fs.readFileSync(file, 'utf8');
const out = src.replace(/provider\s*=\s*"(sqlite|postgresql|mysql)"/, `provider = "${target}"`);
if (out === src) {
  console.log(`Le provider est déjà "${target}".`);
} else {
  fs.writeFileSync(file, out);
  console.log(`Provider basculé sur "${target}". Pensez à ajuster DATABASE_URL puis à relancer la migration.`);
}
