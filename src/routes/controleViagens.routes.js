const { Router } = require('express');
const controller = require('../controllers/controleViagens.controller');
const {
  updateColumn, createViagem, updateViagem,
  finalizeViagem, cancelViagem, addComment,
} = require('../validators/controleViagens.validator');
const validate = require('../middleware/validate');
const { uuidParams } = require('../middleware/paramValidators');
const auth = require('../middleware/auth');
const tenant = require('../middleware/tenant');
const requirePermission = require('../middleware/permission');

const router = Router();
const requireModule = requirePermission('controle-viagens');

// Board + truck-level
router.get   ('/board',                                  auth, tenant, requireModule, controller.getBoard);
router.get   ('/truck/:truckId',                         auth, tenant, requireModule, uuidParams('truckId'), controller.getTruckDetail);
router.patch ('/truck/:truckId/column',                  auth, tenant, requireModule, uuidParams('truckId'), updateColumn, validate, controller.updateColumn);

// Viagens
router.get   ('/truck/:truckId/viagens',                 auth, tenant, requireModule, uuidParams('truckId'), controller.listViagens);
router.post  ('/truck/:truckId/viagens',                 auth, tenant, requireModule, uuidParams('truckId'), createViagem, validate, controller.createViagem);
router.patch ('/viagens/:viagemId',                      auth, tenant, requireModule, uuidParams('viagemId'), updateViagem, validate, controller.updateViagem);
router.post  ('/viagens/:viagemId/start',                auth, tenant, requireModule, uuidParams('viagemId'), controller.startViagem);
router.post  ('/viagens/:viagemId/finalize',             auth, tenant, requireModule, uuidParams('viagemId'), finalizeViagem, validate, controller.finalizeViagem);
router.post  ('/viagens/:viagemId/cancel',               auth, tenant, requireModule, uuidParams('viagemId'), cancelViagem, validate, controller.cancelViagem);
router.delete('/viagens/:viagemId',                      auth, tenant, requireModule, uuidParams('viagemId'), controller.removeViagem);

// Activity log + comments
router.get   ('/truck/:truckId/activity',                auth, tenant, requireModule, uuidParams('truckId'), controller.listActivity);
router.post  ('/truck/:truckId/comments',                auth, tenant, requireModule, uuidParams('truckId'), addComment, validate, controller.addComment);
router.delete('/activity/:eventId',                      auth, tenant, requireModule, uuidParams('eventId'), controller.deleteComment);

module.exports = router;
