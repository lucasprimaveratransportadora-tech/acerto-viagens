const auditService = require('../services/audit.service');
const asyncHandler = require('../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const result = await auditService.list(req.user.empresa_id, req.query);
  res.json(result);
});

const byEntity = asyncHandler(async (req, res) => {
  const { entityType, entityId } = req.params;
  const items = await auditService.listByEntity(req.user.empresa_id, entityType.toUpperCase(), entityId);
  res.json({ items });
});

module.exports = { list, byEntity };
