import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router";
import { routes } from "./routes.tsx";
import "./app.css";
import { trackViewport } from "./viewport.ts";

trackViewport();

// A new version waits until the person chooses to reload; phones that resume the app check again.
if ("serviceWorker" in navigator) {
  void import("virtual:pwa-register").then(({ registerSW }) => {
    const update = registerSW({
      onNeedRefresh: () => window.dispatchEvent(new CustomEvent("stellwall:update", { detail: () => void update(true) })),
      onRegisteredSW: (_url, reg) => {
        if (!reg) return;
        document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void reg.update(); });
      },
    });
  });
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } } });
const router = createBrowserRouter(routes);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
