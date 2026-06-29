const { register } = require('./handlers.js');
const { register: registerKit } = require('./kitHandlers.js');

function registerAll() {
  register();
  registerKit();
}

module.exports = { register: registerAll };
