export default [
  {
    files: ["custom_components/myfitnesspal/frontend/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        console: "readonly",
        customElements: "readonly",
        HTMLElement: "readonly",
        URL: "readonly",
        window: "readonly",
      },
    },
    rules: {
      "no-dupe-keys": "error",
      "no-self-assign": "error",
      "no-sparse-arrays": "error",
      "no-undef": "error",
      "no-unreachable": "error",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "valid-typeof": "error",
    },
  },
];
