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

module.exports = router;
