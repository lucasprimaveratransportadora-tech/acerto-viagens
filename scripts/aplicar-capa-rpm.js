const fs = require('node:fs');
const path = require('node:path');
const prisma = require('../src/config/database');

const imagePath = path.join(__dirname, '..', 'public', 'assets', 'images', 'rpm-capa.png');

async function main() {
  const image = fs.readFileSync(imagePath);
  const empresas = await prisma.empresa.findMany({
    where: { nome: { contains: 'RPM', mode: 'insensitive' }, ativo: true },
    select: { id: true, nome: true },
  });
  if (empresas.length !== 1) {
    throw new Error(`Esperava uma empresa RPM ativa, encontrei ${empresas.length}.`);
  }
  const empresa = empresas[0];
  await prisma.empresa.update({
    where: { id: empresa.id },
    data: {
      capa_dados: image,
      capa_mime: 'image/png',
      capa_tamanho: image.length,
      capa_posicao: 'center',
    },
  });
  console.log(JSON.stringify({ empresa: empresa.nome, bytes: image.length, mime: 'image/png' }));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});

