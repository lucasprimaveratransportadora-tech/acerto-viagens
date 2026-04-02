const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  const bcryptRounds = parseInt(process.env.BCRYPT_ROUNDS, 10) || 12;

  // Dados do .env ou defaults
  const empresaNome = process.env.EMPRESA_NOME || 'Prima Transportadora';
  const empresaCnpj = process.env.EMPRESA_CNPJ || null;
  const adminNome = process.env.ADMIN_NOME || 'Administrador';
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@prima.com.br';
  const adminSenha = process.env.ADMIN_SENHA || 'admin123';

  console.log('Seeding database...');

  // Create empresa
  const empresa = await prisma.empresa.upsert({
    where: { cnpj: empresaCnpj || 'seed-default' },
    update: {},
    create: {
      nome: empresaNome,
      cnpj: empresaCnpj,
    },
  });
  console.log(`Empresa created: ${empresa.nome} (${empresa.id})`);

  // Create admin user
  const senhaHash = await bcrypt.hash(adminSenha, bcryptRounds);
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      empresa_id: empresa.id,
      nome: adminNome,
      email: adminEmail,
      senha_hash: senhaHash,
      role: 'ADMIN',
    },
  });
  console.log(`Admin user created: ${admin.email} (${admin.role})`);

  console.log('\nSeed completed successfully!');
  console.log(`\nLogin with:\n  Email: ${adminEmail}\n  Senha: ${adminSenha}`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
