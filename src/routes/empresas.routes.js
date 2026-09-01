const { Router } = require('express');
const controller = require('../controllers/empresas.controller');
const { createEmpresa, updateEmpresa } = require('../validators/empresa.validator');
const validate = require('../middleware/validate');
const { uuidParams } = require('../middleware/paramValidators');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const multer = require('multer');
const { body } = require('express-validator');
const logoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 }, fileFilter: (_req, file, cb) => cb(null, ['image/png','image/jpeg','image/webp'].includes(file.mimetype)) });

const router = Router();

router.get('/', auth, rbac('SUPER_ADMIN'), controller.list);
router.post('/', auth, rbac('SUPER_ADMIN'), createEmpresa, validate, controller.create);
router.get('/:id', auth, rbac('SUPER_ADMIN'), uuidParams('id'), controller.getById);
router.patch('/:id', auth, rbac('SUPER_ADMIN'), uuidParams('id'), updateEmpresa, validate, controller.update);
router.delete('/:id', auth, rbac('SUPER_ADMIN'), uuidParams('id'), controller.remove);
router.post('/:id/logo', auth, rbac('SUPER_ADMIN'), uuidParams('id'), logoUpload.single('logo'), controller.uploadLogo);
router.get('/:id/logo', uuidParams('id'), controller.logo); // branding público; não contém dado operacional
router.patch('/:id/status', auth, rbac('SUPER_ADMIN'), uuidParams('id'), body('ativo').isBoolean(), validate, controller.setStatus);

module.exports = router;
