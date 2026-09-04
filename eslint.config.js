import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores([
    "dist",
    "infra/cdk.out",
    // tsc/ts-node emit .js and .d.ts next to the CDK sources; .gitignore and
    // .prettierignore skip the same emit.
    "infra/**/*.js",
    "infra/**/*.d.ts",
  ]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    rules: {
      // The react-hooks and react-refresh presets ship these as warnings, and
      // `npm run lint` runs with --max-warnings 0. Promote them to errors so
      // the severity in this file matches the severity the gate enforces.
      "react-hooks/exhaustive-deps": "error",
      "react-hooks/rules-of-hooks": "error",
      "react-refresh/only-export-components": "error",
      // date-fns v4's root re-exports ~250 modules. The browser bundle
      // tree-shakes it, but every vitest file that touches it pays ~3.3 s to
      // import the barrel, so each function is imported from its own subpath
      // instead. This keeps the barrel from creeping back in one import at a
      // time; `date-fns/addMonths` is the exact module the barrel re-exports.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "date-fns",
              message:
                'Import the function from its own subpath instead, e.g. import { addMonths } from "date-fns/addMonths".',
            },
          ],
        },
      ],
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        project: [
          "./tsconfig.app.json",
          "./tsconfig.node.json",
          "./tsconfig.test.json",
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // The CDK app is Node code with its own compiler settings. This block is
    // merged on top of the one above, so infra sources keep the same typed
    // rules but resolve against infra/tsconfig.json instead of the app's
    // project references. Linting them requires `npm --prefix infra ci`.
    files: ["infra/**/*.ts"],
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      parserOptions: {
        project: ["./infra/tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
]);
