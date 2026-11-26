import type { FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import { eq } from "drizzle-orm";
import type { WebSocket } from "@fastify/websocket";
import type { Db } from "../db/client.ts";
import { lists, todos } from "../db/schema.ts";
import { todoMemberIds } from "../todos/routes.ts";
import { eventAudience } from "../calendar/events.ts";
import { birthdayAudience } from "../calendar/birthdays.ts";
import { listMemberIds } from "../shopping/visibility.ts";
import type { LiveNotifier as Notifier } from "../shopping/notify.ts";

/**
 * Connected devices per member. Messages are only hints ("list X changed"); the data itself is
 * always fetched again through the checked API. Visibility is checked when a hint is sent.
 */
export function createHub(db: Db) {
  const sockets = new Map<string, Set<WebSocket>>();

  function add(memberId: string, ws: WebSocket) {
    const set = sockets.get(memberId) ?? new Set();
    set.add(ws);
    sockets.set(memberId, set);
    ws.on("close", () => {
      set.delete(ws);
      if (!set.size) sockets.delete(memberId);
    });
  }

  function send(memberIds: Iterable<string>, msg: object) {
    const text = JSON.stringify(msg);
    for (const id of memberIds) for (const ws of sockets.get(id) ?? []) if (ws.readyState === ws.OPEN) ws.send(text);
  }

  async function listChanged(listId: string) {
    const rows = await db.select({ everyone: lists.everyone }).from(lists).where(eq(lists.id, listId)).limit(1);
    if (!rows[0]) return;
    const allowed = rows[0].everyone ? [...sockets.keys()] : await listMemberIds(db, listId);
    send(allowed, { type: "list", id: listId });
  }

  async function todoChanged(todoId: string) {
    const rows = await db.select({ everyone: todos.everyone }).from(todos).where(eq(todos.id, todoId)).limit(1);
    if (!rows[0]) return;
    const allowed = rows[0].everyone ? [...sockets.keys()] : await todoMemberIds(db, todoId);
    send(allowed, { type: "todos" });
  }

  const notifier: Notifier = {
    list: (listId) => void listChanged(listId).catch(() => {}),
    lists: () => send([...sockets.keys()], { type: "lists" }),
    todo: (todoId) => void todoChanged(todoId).catch(() => {}),
    todoGone: (audience) => send(audience ?? [...sockets.keys()], { type: "todos" }),
    calendar: (id) => void eventAudience(db, id).then((a) => send(a ?? [...sockets.keys()], { type: "calendar" })).catch(() => {}),
    birthday: (id) => void birthdayAudience(db, id).then((a) => send(a ?? [...sockets.keys()], { type: "calendar" })).catch(() => {}),
    calendarGone: (audience) => send(audience ?? [...sockets.keys()], { type: "calendar" }),
    meals: () => send([...sockets.keys()], { type: "meals" }),
  };

  return { add, notifier };
}

export type Hub = ReturnType<typeof createHub>;

export async function liveRoutes(app: FastifyInstance, opts: { hub: Hub; publicUrl: string }) {
  const allowed = new URL(opts.publicUrl).origin;
  await app.register(websocket);
  app.get("/api/live", { websocket: true }, (socket, req) => {
    const origin = req.headers.origin;
    if (origin && origin !== allowed) return socket.close(4403, "origin");
    if (!req.member) return socket.close(4401, "unauthenticated");
    opts.hub.add(req.member.id, socket);
    socket.send(JSON.stringify({ type: "hello" }));
  });
}
