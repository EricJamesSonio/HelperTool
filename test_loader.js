const rulesLoader = require('./Code/ipc/blueprintLibrary/rulesLoader.js');
const data = rulesLoader.loadRulesData();
console.log('Categories:');
data.categories.forEach(c => console.log('  -', c.name, '(' + c.type + ')'));
console.log('\nBlueprints:');
for (const [cat, bps] of Object.entries(data.blueprints)) {
  console.log('  ' + cat + ':');
  bps.forEach(b => console.log('    - "' + b.name + '" |', b.description.slice(0, 70)));
}
