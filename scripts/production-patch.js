const fs = require('node:fs');
const path = require('node:path');

function buildProductionPatch({
  oldEmail = 'ney@vidallogistica.com.br',
  newEmail = 'aneilhomar@icloud.com',
  rpmName = 'RPM',
  capaPath = path.join(__dirname, '..', 'public', 'assets', 'images', 'rpm-capa.png'),
} = {}) {
  return { oldEmail, newEmail, rpmName, capaPath };
}

async function applyProductionPatch(prisma, options = {}) {
  const patch = buildProductionPatch(options);
  const oldUser = await prisma.user.findUnique({ where: { email: patch.oldEmail } });
  const newUser = await prisma.user.findUnique({ where: { email: patch.newEmail } });

  if (oldUser && !newUser) {
    await prisma.user.update({
      where: { id: oldUser.id },
      data: { email: patch.newEmail },
    });
    console.log(`Usuário atualizado: ${patch.oldEmail} -> ${patch.newEmail}`);
  } else if (oldUser && newUser && oldUser.id !== newUser.id) {
    console.warn(`Troca de e-mail ignorada: ${patch.newEmail} já pertence a outro usuário.`);
  }

  if (!fs.existsSync(patch.capaPath)) {
    console.warn(`Capa da RPM não encontrada em ${patch.capaPath}`);
    return;
  }

  const empresas = await prisma.empresa.findMany({ select: { id: true, nome: true } });
  const rpm = empresas.find(empresa => String(empresa.nome || '').toLocaleLowerCase('pt-BR').includes(patch.rpmName.toLocaleLowerCase('pt-BR')));
  if (!rpm) {
    console.warn(`Empresa da capa não encontrada: ${patch.rpmName}`);
    return;
  }

  const capa = fs.readFileSync(patch.capaPath);
  await prisma.empresa.update({
    where: { id: rpm.id },
    data: { capa_dados: capa, capa_mime: 'image/png', capa_tamanho: capa.length, capa_posicao: 'center' },
  });
  console.log(`Capa da ${rpm.nome} aplicada (${capa.length} bytes).`);
}

module.exports = { buildProductionPatch, applyProductionPatch };
