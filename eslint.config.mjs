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
    // Build output of the video projects, and of the walkthrough renderer.
    "video/out/**",
    "video/node_modules/**",
    "video-short/out/**",
    "dist/**",
    // Vendored rendering engine, from the video-by-reference skill's MIT template. Its
    // drawing/FX/audio kits and the headless renderer are third-party code carried as-is
    // (plus two local patches); the film built on top of it — src/shots/, timeline.js,
    // palette.js, film.js, scripts/ — is this project's and is linted normally.
    "video-short/render/**",
    "video-short/src/draw.js",
    "video-short/src/fx.js",
    "video-short/src/post.js",
    "video-short/src/camera.js",
    "video-short/src/main.js",
    "video-short/src/core.js",
    "video-short/src/audio/engine.js",
    "video-short/src/audio/wav.js",
    "video-short/src/audio/*.bak",
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
