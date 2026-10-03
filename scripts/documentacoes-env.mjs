import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// @next/env belongs to Next's dependency graph, not this project's root.
// Resolve through its owner so auxiliary scripts also work with isolated pnpm installs.
const requireNext = createRequire(require.resolve("next/package.json"));

export function loadDocumentationEnv() {
  const { loadEnvConfig } = requireNext("@next/env");
  loadEnvConfig(process.cwd());
}
