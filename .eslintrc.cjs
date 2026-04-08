const js = require("@eslint/js");
const svelte = require("eslint-plugin-svelte");
const globals = require("globals");
/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  js.configs.recommended,
  ...svelte.configs.recommended,
  ...svelte.configs.prettier,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.es2021,
        ...globals.node,
      },
    },
  },
];
