/**
 * vitest.config.ts — isolated component-test harness for the UI kit
 * (Agent L zone). Runs the REAL zustand stores and REAL components against a
 * mocked `fetch` (the only true externality — AGENTS.md §6.5).
 *
 * Installed with `npm i --no-save --no-package-lock` (session 016): package.json
 * and package-lock.json are Agent S's zone and stay untouched.
 *
 * Run: ./node_modules/.bin/vitest run --config components/ui/__tests__/vitest.config.ts
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const frontendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

export default defineConfig({
  root: frontendRoot,
  plugins: [react()],
  resolve: { alias: { "@": frontendRoot } },
  test: {
    environment: "jsdom",
    include: ["components/ui/__tests__/**/*.test.{ts,tsx}"],
  },
});
