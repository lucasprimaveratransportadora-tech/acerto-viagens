const { Router } = require('express');
const router = Router();

router.use('/auth', require('./auth.routes'));
router.use('/empresas', require('./empresas.routes'));
router.use('/users', require('./users.routes'));
router.use('/trucks', require('./trucks.routes'));
router.use('/trips', require('./trips.routes'));
router.use('/ctes', require('./ctes.routes'));
router.use('/fuels', require('./fuels.routes'));
router.use('/expenses', require('./expenses.routes'));
router.use('/dashboard', require('./dashboard.routes'));
router.use('/audit', require('./audit.routes'));
router.use('/login-events', require('./loginEvents.routes'));
router.use('/fretes-terceiros', require('./fretesTerceiros.routes'));
router.use('/truck-ledger', require('./truckLedger.routes'));
router.use('/controle-viagens', require('./controleViagens.routes'));

module.exports = router;
