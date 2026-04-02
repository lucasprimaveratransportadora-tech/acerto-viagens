const jwt = require('jsonwebtoken');
const config = require('../config');
const prisma = require('../config/database');

async function auth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token não fornecido.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, config.jwt.secret);

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, empresa_id: true, nome: true, email: true, role: true, ativo: true },
    });

    if (!user || !user.ativo) {
      return res.status(401).json({ error: 'Usuário inativo ou não encontrado.' });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado.', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Token inválido.' });
  }
}

module.exports = auth;
