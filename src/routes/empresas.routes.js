const { Router } = require('express');
const controller = require('../controllers/empresas.controller');
const { createEmpresa, updateEmpresa } = require('../validators/empresa.validator');
const validate = require('../middleware/validate');
const { uuidParams } = require('../middleware/paramValidators');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const multer = require('multer');
const { body } = require('express-validator');
const { CAPA_MAX_BYTES, CAPA_MIME_TYPES } = require('../services/empresa-brand');
const logoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 }, fileFilter: (_req, file, cb) => cb(null, ['image/png','image/jpeg','image/webp'].includes(file.mimetype)) });
const capaUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: CAPA_MAX_BYTES }, fileFilter: (_req, file, cb) => cb(null, CAPA_MIME_TYPES.has(file.mimetype)) });

const router = Router();

router.get('/', auth, rbac('SUPER_ADMIN'), controller.list);
router.post('/', auth, rbac('SUPER_ADMIN'), createEmpresa, validate, controller.create);
router.get('/:id', auth, rbac('SUPER_ADMIN'), uuidParams('id'), controller.getById);
router.patch('/:id', auth, rbac('SUPER_ADMIN'), uuidParams('id'), updateEmpresa, validate, controller.update);
router.delete('/:id', auth, rbac('SUPER_ADMIN'), uuidParams('id'), controller.remove);
router.post('/:id/logo', auth, rbac('SUPER_ADMIN'), uuidParams('id'), logoUpload.single('logo'), controller.uploadLogo);
router.get('/:id/logo', uuidParams('id'), controller.logo); // branding público; não contém dado operacional
router.post('/:id/capa', auth, rbac('SUPER_ADMIN'), uuidParams('id'), capaUpload.single('capa'), controller.uploadCapa);
router.get('/:id/capa', uuidParams('id'), controller.capa); // branding público; não contém dado operacional
router.patch('/:id/status', auth, rbac('SUPER_ADMIN'), uuidParams('id'), body('ativo').isBoolean(), validate, controller.setStatus);

module.exports = router;
