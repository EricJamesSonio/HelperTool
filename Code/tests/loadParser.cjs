const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadParser() {
  const parserPath = path.join(__dirname, '../renderer/globalSeeder/parser.js');
  const fileSeederParserPath = path.join(__dirname, '../renderer/fileSeederTool/parser.js');
  
  let fileSeederCode = fs.readFileSync(fileSeederParserPath, 'utf-8');
  // Transform fileSeeder parser to CJS
  fileSeederCode = fileSeederCode.replace(/export function parseInput/, 'module.exports.parseInput = function parseInput');
  // Wrap in module
  const fileSeederModule = { exports: {} };
  const fileSeederContext = {
    module: fileSeederModule,
    exports: fileSeederModule.exports,
    require: require,
  };
  vm.runInNewContext(fileSeederCode, fileSeederContext, { filename: fileSeederParserPath });
  const parseInput = fileSeederModule.exports.parseInput;

  let parserCode = fs.readFileSync(parserPath, 'utf-8');
  // Remove the re-export line and replace with our parseInput
  parserCode = parserCode.replace(/export \{ parseInput \} from.*/, '');
  // Replace export function parseContentBlocks with module.exports
  parserCode = parserCode.replace(/export function parseContentBlocks/, 'module.exports.parseContentBlocks = function parseContentBlocks');
  // Remove other export keywords for isValidPath etc if needed - they are not exported, just internal functions, keep as is
  // Inject parseInput reference
  parserCode = `const parseInput = global.__parseInput;` + '\n' + parserCode;
  // Also need to expose isValidPath etc? Not needed for test, only parseContentBlocks and parseInput

  const parserModule = { exports: {} };
  const parserContext = {
    module: parserModule,
    exports: parserModule.exports,
    require: require,
    global: { __parseInput: parseInput },
  };
  // Need to provide parseInput in global scope for eval
  const context = vm.createContext({
    module: parserModule,
    exports: parserModule.exports,
    require: require,
    console: console,
    global: { __parseInput: parseInput },
    // Provide Set/Map etc
  });
  // Use a different approach: just eval with parseInput in scope
  const wrappedCode = `
    ${parserCode}
  `;
  // We'll use vm.runInContext with parseInput available
  const script = new vm.Script(wrappedCode, { filename: parserPath });
  const sandbox = {
    module: parserModule,
    exports: parserModule.exports,
    require: require,
    console: console,
    parseInput: parseInput,
    global: {},
  };
  // Instead, simpler: just create a function that returns the exports
  // Let's do manual transform: replace export function parseContentBlocks
  // Already done, now run
  vm.runInNewContext(parserCode, sandbox, { filename: parserPath });
  // After run, sandbox.module.exports should have parseContentBlocks
  // But our transform used module.exports.parseContentBlocks, so it should be there
  // Also need to handle the injected parseInput global
  if (!sandbox.module.exports.parseContentBlocks) {
    // Fallback: try to get from sandbox
    sandbox.module.exports.parseContentBlocks = sandbox.parseContentBlocks;
  }
  return {
    parseInput: parseInput,
    parseContentBlocks: sandbox.module.exports.parseContentBlocks || sandbox.parseContentBlocks,
  };
}

module.exports = { loadParser };
