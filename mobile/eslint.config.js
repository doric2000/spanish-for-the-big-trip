// https://docs.expo.dev/guides/using-eslint/
const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const globals = require('globals');

module.exports = defineConfig([
  globalIgnores(['dist/*', '.expo/*']),
  expoConfig,
  // Tests and config files run in Node (node --test, Metro), not in the app.
  {
    files: ['tests/**/*.cjs', '*.config.js'],
    languageOptions: { globals: globals.node },
  },
]);
