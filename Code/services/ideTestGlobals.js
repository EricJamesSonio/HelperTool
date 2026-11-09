'use strict';

const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/i;
const TEST_DIR = /(?:^|\/)(?:__tests?__|__mocks__|tests?|specs?|e2e)\//i;

const NAMES = (
  'jest vi describe it test expect beforeEach afterEach beforeAll afterAll ' +
  'xdescribe xit xtest fdescribe fit pending fail spyOn jasmine ' +
  'suite context specify before after suiteSetup suiteTeardown'
).split(' ');

const TEST_GLOBALS = new Set(NAMES);

function isTestFile(file) {
  const f = String(file || '').replace(/\\/g, '/');
  return TEST_FILE.test(f) || TEST_DIR.test(f);
}

function testGlobalsFor(file) {
  return isTestFile(file) ? TEST_GLOBALS : null;
}

module.exports = { isTestFile, testGlobalsFor };