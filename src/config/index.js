try { require('dotenv').config(); } catch (_) { /* dotenv opcional em produção */ }

const nodeEnv = process.env.NODE_ENV || 'development';

// Em produção, JWT_SECRET / JWT_REFRESH_SECRET DEVEM vir do ambiente.
// Sem isso, o fallback hardcoded torna tokens triviais de forjar — fail-fast
// é mais seguro do que subir com um secret previsível.
function requireSecret(name, fallback) {
  const v = process.env[name];
  if (v && v.length >= 16) return v;
  if (nodeEnv === 'production') {
    throw new Error(
      `[config] ${name} ausente ou curto demais em produção. ` +
      `Defina ${name} no ambiente do Railway antes de subir.`
    );
  }
  return fallback;
}

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv,
  jwt: {
    secret: requireSecret('JWT_SECRET', 'dev-secret-change-in-production'),
    refreshSecret: requireSecret('JWT_REFRESH_SECRET', 'dev-refresh-secret-change'),
    accessExpiresIn: '15m',
    refreshExpiresIn: '7d',
    refreshExpiresMs: 7 * 24 * 60 * 60 * 1000,
  },
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS, 10) || 12,
  allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  r2: {
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucketName: process.env.R2_BUCKET_NAME || 'prima-anexos',
    publicUrl: process.env.R2_PUBLIC_URL,
  },
};
