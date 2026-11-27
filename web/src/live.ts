import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

/** Keeps one live connection open; change notices refresh the affected data. */
export function useLive(enabled: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled || typeof WebSocket === "undefined") return;
    let ws: WebSocket | null = null;
    let retry = 1000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const open = () => {
      const url = location.origin.replace(/^http/, "ws") + "/api/live";
      ws = new WebSocket(url);
      ws.onopen = () => {
        retry = 1000;
        // Anything may have changed while we were away.
        void qc.invalidateQueries();
      };
      ws.onmessage = (ev) => {
        const msg = JSON.parse(String(ev.data)) as { type: string; id?: string };
        if (msg.type === "list") {
          void qc.invalidateQueries({ queryKey: ["items", msg.id] });
          void qc.invalidateQueries({ queryKey: ["lists"] });
          void qc.invalidateQueries({ queryKey: ["board"] });
        } else if (msg.type === "lists") void qc.invalidateQueries({ queryKey: ["lists"] });
        else if (msg.type === "calendar") {
          void qc.invalidateQueries({ queryKey: ["calendar"] });
          void qc.invalidateQueries({ queryKey: ["birthdays"] });
          void qc.invalidateQueries({ queryKey: ["board"] });
        } else if (msg.type === "meals") void qc.invalidateQueries({ queryKey: ["meals"] });
        else if (msg.type === "documents") void qc.invalidateQueries({ queryKey: ["documents"] });
        else if (msg.type === "todos") {
          void qc.invalidateQueries({ queryKey: ["todos"] });
          void qc.invalidateQueries({ queryKey: ["board"] });
        }
      };
      ws.onclose = () => {
        if (stopped) return;
        timer = setTimeout(open, retry);
        retry = Math.min(retry * 2, 30_000);
      };
    };
    open();
    return () => {
      stopped = true;
      clearTimeout(timer);
      ws?.close();
    };
  }, [enabled, qc]);
}
