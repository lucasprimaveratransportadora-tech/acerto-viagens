const { Router } = require('express');
const controller = require('../controllers/controleViagens.controller');
const { upsertState, addComment } = require('../validators/controleViagens.validator');
const validate = require('../middleware/validate');
const { uuidParams } = require('../middleware/paramValidators');
const auth = require('../middleware/auth');
const tenant = require('../middleware/tenant');
const requirePermission = require('../middleware/permission');

const router = Router();
const requireModule = requirePermission('controle-viagens');

router.get   ('/board',                            auth, tenant, requireModule, controller.getBoard);
router.get   ('/:truckId',                         auth, tenant, requireModule, uuidParams('truckId'), controller.getDetail);
router.patch ('/:truckId/state',                   auth, tenant, requireModule, uuidParams('truckId'), upsertState, validate, controller.upsertState);
router.get   ('/:truckId/comments',                auth, tenant, requireModule, uuidParams('truckId'), controller.listComments);
router.post  ('/:truckId/comments',                auth, tenant, requireModule, uuidParams('truckId'), addComment, validate, controller.addComment);
router.delete('/:truckId/comments/:id',            auth, tenant, requireModule, uuidParams('truckId', 'id'), controller.deleteComment);

module.exports = router;
