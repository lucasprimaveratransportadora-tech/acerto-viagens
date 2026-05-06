const { Router } = require('express');
const controller = require('../controllers/audit.controller');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

const router = Router();

router.get('/', auth, rbac('ADMIN'), controller.list);
router.get('/:entityType/:entityId', auth, rbac('ADMIN'), controller.byEntity);

module.exports = router;
