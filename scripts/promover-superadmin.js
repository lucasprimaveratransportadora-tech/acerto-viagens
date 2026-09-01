require('dotenv').config();
const prisma = require('../src/config/database');

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error('Uso: node scripts/promover-superadmin.js email@dominio.com');
  const user = await prisma.user.update({ where: { email }, data: { role: 'SUPER_ADMIN' }, select: { id:true, nome:true, email:true,role:true } });
  console.log(`Promovido: ${user.email} -> ${user.role}`);
}
main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
