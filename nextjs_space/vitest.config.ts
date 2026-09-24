import path from "node:path";
import { defineConfig } from "vitest/config";

// Unit tests only: pure modules, no database (docs/features/33).
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "features/**/*.test.ts"],
  },
});
