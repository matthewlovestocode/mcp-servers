import js from "@eslint/js";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";
import eslintConfigPrettier from "eslint-config-prettier";

export default [
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ["src/**/*.ts"],
    ignores: ["dist/**"],
    languageOptions: {
      ...(config.languageOptions ?? {}),
      parserOptions: {
        ...(config.languageOptions?.parserOptions ?? {}),
        project: "./tsconfig.json"
      }
    }
  })),
  {
    name: "github-mcp/imports",
    files: ["src/**/*.ts"],
    plugins: {
      import: importPlugin
    },
    settings: {
      "import/resolver": {
        typescript: true
      }
    },
    rules: {
      "import/no-unresolved": "error",
      "import/no-duplicates": "error"
    }
  },
  eslintConfigPrettier
];
