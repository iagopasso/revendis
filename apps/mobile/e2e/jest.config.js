module.exports = {
  rootDir: '..',
  testMatch: ['<rootDir>/e2e/**/*.e2e.js'],
  testTimeout: 120000,
  testEnvironment: 'detox/runners/jest/environment',
  testRunner: 'jest-circus/runner'
};
