import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { ConnectionBanner } from "./ConnectionBanner.tsx";
import { de } from "../text/de.ts";

describe("ConnectionBanner", () => {
  it("ConnectionBanner shows when offline event fires", () => {
    render(<ConnectionBanner />);
    expect(screen.queryByText(de.connection.offline)).not.toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByText(de.connection.offline)).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.queryByText(de.connection.offline)).not.toBeInTheDocument();
  });
});
