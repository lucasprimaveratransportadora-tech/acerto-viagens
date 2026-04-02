const { Router } = require('express');
const controller = require('../controllers/empresas.controller');
const { createEmpresa, updateEmpresa } = require('../validators/empresa.validator');
const validate = require('../middleware/validate');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

const router = Router();

router.get('/', auth, rbac('ADMIN'), controller.list);
router.post('/', auth, rbac('ADMIN'), createEmpresa, validate, controller.create);
router.get('/:id', auth, rbac('ADMIN'), controller.getById);
router.patch('/:id', auth, rbac('ADMIN'), updateEmpresa, validate, controller.update);
router.delete('/:id', auth, rbac('ADMIN'), controller.remove);

module.exports = router;
