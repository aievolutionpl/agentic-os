import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "release/**",
      "node_modules/**",
      "docs/evidence/**",
      "licenses/**",
    ],
  },
  // Application code: full recommended set.
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-require-imports": "off",
      // Intentional: if a child process cannot be confirmed stopped, that must
      // override an earlier body error rather than be swallowed by it.
      "no-unsafe-finally": "off",
    },
  },
  // Tests and scripts: correctness only. They intentionally build ANSI escapes,
  // use empty catch blocks for cleanup and regex fixtures, so style rules are off.
  {
    files: ["tests/**/*.mjs", "scripts/**/*.mjs"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      "no-empty": "off",
      "no-control-regex": "off",
      "no-useless-escape": "off",
      // Deferred initialisation (let store; store = new Store(...)) is used so a
      // cleanup closure can reference the binding before it exists.
      "prefer-const": "off",
      "no-constant-condition": ["error", { checkLoops: false }],
      "no-dupe-keys": "error",
      "no-self-assign": "error",
      "no-unreachable": "error",
      "no-fallthrough": "error",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
      // Intentional: if a child process cannot be confirmed stopped, that must
      // override an earlier body error rather than be swallowed by it.
      "no-unsafe-finally": "off",
    },
  },
);
