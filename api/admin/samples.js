const { adminSamplesHandler } = require("../../lib/handlers");

module.exports = adminSamplesHandler;
module.exports.config = {
  api: {
    bodyParser: false,
  },
};
