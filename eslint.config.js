// Flat ESLint config (ESLint v9+). The repo ships `eslint` + `typescript-eslint`
// as dev dependencies; this file is what makes `npm run lint` (`eslint .`) actually
// run. Type-aware linting is intentionally NOT enabled (no `parserOptions.project`)
// to keep lint fast and free of tsconfig coupling — `tsc --noEmit` owns type safety.
import tseslint from "typescript-eslint";

export default tseslint.config(
  // Build artifacts and deps are never linted.
  { ignores: ["node_modules/", "dist/", "coverage/"] },

  // Rules apply to the sample app and its tests (CLAUDE.md: "eslint over src/ and
  // tests/"). Other files in the tree (skill `.mjs` scripts, this config) are parsed
  // but carry no rules, so `eslint .` stays green across the whole repo.
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    extends: [...tseslint.configs.recommended],
    rules: {
      // The sample app is a library-style module; stray console output is a smell.
      // `src/index.ts` opts in deliberately via an inline disable on its demo print.
      "no-console": "error",

      // Enforce the repo's "named exports only" convention (.claude/rules/code-style.md)
      // with a core rule — no extra plugin needed.
      "no-restricted-syntax": [
        "error",
        {
          selector: "ExportDefaultDeclaration",
          message:
            "Named exports only — no default exports (see .claude/rules/code-style.md).",
        },
      ],
    },
  },
);
