import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Pure logic only — `lib/shared` is isomorphic and does no I/O, so it needs
    // no DOM. Component/browser behaviour is covered by the Playwright suite.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
