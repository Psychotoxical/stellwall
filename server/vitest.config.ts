import { defineConfig } from "vitest/config";

// Password hashing is deliberately slow; many test files at once need more than the default 5 s.
export default defineConfig({ test: { testTimeout: 30_000, hookTimeout: 30_000 } });
