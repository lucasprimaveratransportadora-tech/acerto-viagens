const { Router } = require('express');
const controller = require('../controllers/audit.controller');
const { uuidParams, entityTypeParam } = require('../middleware/paramValidators');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

const router = Router();

router.get('/', auth, rbac('ADMIN'), controller.list);
router.get(
  '/:entityType/:entityId',
  auth,
  rbac('ADMIN'),
  entityTypeParam('entityType'),
  uuidParams('entityId'),
  controller.byEntity,
);

module.exports = router;
