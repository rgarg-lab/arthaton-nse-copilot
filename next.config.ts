import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  /**
   * PGlite ships Postgres as WASM and resolves its own filesystem/socket shims at
   * runtime. Bundling it breaks that (the bundler tries to resolve `ws`, which the WASM
   * glue only references on paths it never takes here), so it is loaded from
   * node_modules on the server instead.
   */
  serverExternalPackages: ["@electric-sql/pglite", "@electric-sql/pglite-pgvector"],
  // If a page reads data files at request time, list them here so they travel with the
  // server bundle, e.g. `outputFileTracingIncludes: { "/": ["./seed/*.json"] }`.
  outputFileTracingIncludes: {
    "/api/**/*": ["./seed/*.json", "./src/db/migrations/**/*"],
  },
};

export default nextConfig;
