import { Link } from "react-router";
import type { ComponentType, SVGProps } from "react";
import { Icon } from "../icons.ts";
import { useMe } from "../session.ts";
import { de } from "../text/de.ts";
import { useBoard, useMembers, useTodos } from "../shopping-api.ts";
import { TodoRow } from "./Todos.tsx";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api.ts";
import { addDays, shortDay, todayYmd, useCalendar, hhmm, ymd } from "../calendar-api.ts";
import { CalList } from "./Calendar.tsx";
import { useNavigate } from "react-router";

const AREAS: { key: keyof typeof de.areas; icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { key: "einkauf", icon: Icon.Einkauf },
  { key: "todos", icon: Icon.Todos },
  { key: "kalender", icon: Icon.Kalender },
  { key: "geburtstage", icon: Icon.Geburtstage },
  { key: "dokumente", icon: Icon.Dokumente },
  { key: "essensplan", icon: Icon.Essensplan },
];

const LINKS: Partial<Record<keyof typeof de.areas, string>> = { einkauf: "/einkauf", todos: "/todos", kalender: "/kalender", geburtstage: "/kalender/geburtstage" };

export function Header({ title, sub }: { title: string; sub?: string }) {
  const me = useMe().data;
  return (
    <header className="head">
      <div>
        {sub && <p>{sub}</p>}
        <h1>{title}</h1>
      </div>
      {me && (
        <Link to="/konto" className="avatar" style={{ background: `var(--${me.color})` }} aria-label={de.nav.account}>
          {me.displayName.slice(0, 1).toUpperCase()}
        </Link>
      )}
    </header>
  );
}

export function Home() {
  const me = useMe().data!;
  const today = new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
  return (
    <>
      <Header sub={today} title={de.home.hello(me.displayName)} />
      <div className="cols">
        <Board />
        <section aria-labelledby="areas-h">
          <MyToday />
          <div className="sechead">
            <h2 id="areas-h">{de.home.areas}</h2>
          </div>
          <div className="areas">
            {AREAS.map(({ key, icon: I }) =>
              key in LINKS ? (
                <Link key={key} to={LINKS[key]!} className="area">
                  <I className="ico" aria-hidden="true" />
                  <b>{de.areas[key]}</b>
                  <small />
                </Link>
              ) : (
                <div key={key} className="area is-soon">
                  <I className="ico" aria-hidden="true" />
                  <b>{de.areas[key]}</b>
                  <small>{de.areas.soon}</small>
                </div>
              ),
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function Board() {
  const rows = useBoard().data ?? [];
  const time = (iso: string) => new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  return (
    <section className="board" aria-labelledby="board-h">
      <div className="board-head">
        <h2 id="board-h">{de.home.board}</h2>
        <span>{de.board.count(rows.length)}</span>
      </div>
      {rows.length === 0 && <p className="board-empty">{de.home.boardEmpty}</p>}
      {rows.map((r) =>
        r.kind === "shopping" ? (
          <Link key={"s" + r.who + r.listId} to={`/einkauf?liste=${r.listId}`} className="brow">
            <span className="tm">{time(r.latestAt)}</span>
            <span className="what">
              {de.board.added(r.whoName, r.count, r.listName)}
              <em>{de.board.area}</em>
            </span>
            <span className="tag">{de.board.tag}</span>
          </Link>
        ) : r.kind === "event" ? (
          <Link key={"e" + r.eventId} to={`/kalender?tag=${ymd(new Date(r.start))}`} className="brow">
            <span className="tm">{time(r.latestAt)}</span>
            <span className="what">
              {de.board.entered(r.whoName, r.title, shortDay(ymd(new Date(r.start))) + (r.allDay ? "" : " " + hhmm(r.start)))}
              <em>{de.board.calendarArea}</em>
            </span>
            <span className="tag">{de.board.tag}</span>
          </Link>
        ) : (
          <Link key={"t" + r.todoId} to="/todos" className="brow">
            <span className="tm">{time(r.latestAt)}</span>
            <span className="what">
              {de.board.gave(r.whoName, r.title)}
              <em>{de.board.todoArea}</em>
            </span>
            <span className="tag">{de.board.tag}</span>
          </Link>
        ),
      )}
    </section>
  );
}

function MyToday() {
  const list = useTodos("today", true);
  const members = useMembers().data ?? [];
  const qc = useQueryClient();
  const rows = list.data ?? [];
  const today = todayYmd();
  const cal = useCalendar(today, addDays(today, 1), true).data ?? [];
  const navigate = useNavigate();
  return (
    <>
      <div className="sechead">
        <h2>{de.todos.myToday}</h2>
      </div>
      {cal.length > 0 && <CalList list={cal} date={today} members={members} onOpen={(i) => navigate(i.kind === "birthday" ? "/kalender/geburtstage" : `/kalender?tag=${today}`)} />}
      {rows.length === 0 && cal.length > 0 ? null : rows.length === 0 ? (
        <div className="box"><p className="empty">{de.todos.myTodayEmpty}</p></div>
      ) : (
        <ul className="box todolist">
          {rows.map((o) => (
            <TodoRow
              key={o.todoId + (o.date ?? "")}
              o={o}
              members={members}
              onOpen={() => {}}
              onToggle={async () => {
                const date = o.date ?? "1970-01-01";
                if (o.done) await api(`/api/todos/${o.todoId}/done/${date}`, { method: "DELETE" });
                else await api(`/api/todos/${o.todoId}/done`, { method: "POST", body: { date } });
                await qc.invalidateQueries({ queryKey: ["todos"] });
              }}
            />
          ))}
        </ul>
      )}
    </>
  );
}
