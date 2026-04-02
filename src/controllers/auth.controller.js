const authService = require('../services/auth.service');
const asyncHandler = require('../utils/asyncHandler');
const config = require('../config');

const login = asyncHandler(async (req, res) => {
  const { email, senha } = req.body;
  const result = await authService.login(email, senha);

  // Set refresh token as httpOnly cookie
  res.cookie('refreshToken', result.refreshToken, {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'strict',
    maxAge: config.jwt.refreshExpiresMs,
    path: '/api/auth',
  });

  res.json({
    accessToken: result.accessToken,
    user: result.user,
  });
});

const refresh = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  const result = await authService.refresh(refreshToken);

  res.cookie('refreshToken', result.refreshToken, {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'strict',
    maxAge: config.jwt.refreshExpiresMs,
    path: '/api/auth',
  });

  res.json({ accessToken: result.accessToken });
});

const logout = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  await authService.logout(refreshToken);

  res.clearCookie('refreshToken', { path: '/api/auth' });
  res.json({ message: 'Logout realizado.' });
});

const me = asyncHandler(async (req, res) => {
  res.json({ user: req.user });
});

module.exports = { login, refresh, logout, me };
