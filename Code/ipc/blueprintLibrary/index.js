const { register } = require('./handlers.js');
const { register: registerKit } = require('./kitHandlers.js');
const { register: registerMotherBox } = require('./motherBoxHandlers.js');

function registerAll() {
  register();
  registerKit();
  registerMotherBox();
}

module.exports = { register: registerAll };
