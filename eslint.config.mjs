import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Not project code: the Python pipeline's virtualenv and untracked scratch files.
    "pipeline/**",
    ".local/**",
    // Build output of the video project, and of the walkthrough renderer.
    "video/out/**",
    "video/node_modules/**",
    "dist/**",
  ]),
  {
    rules: {
      // A leading underscore is this codebase's "deliberately unused" marker —
      // a discarded destructure (`const { $schema: _schema, ...rest }`), or a
      // parameter kept for signature shape. Without this the convention reads
      // as sixteen warnings and real dead code hides among them.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
]);

export default eslintConfig;
