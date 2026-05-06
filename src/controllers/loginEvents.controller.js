const loginEventsService = require('../services/loginEvents.service');
const asyncHandler = require('../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const result = await loginEventsService.list(req.user.empresa_id, req.query);
  res.json(result);
});

module.exports = { list };
