import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => cleanup());

// No live connection in unit tests.
Object.defineProperty(globalThis, "WebSocket", { value: undefined, writable: true });
