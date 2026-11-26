import { Link } from "react-router";
import type { ComponentType, SVGProps } from "react";
import { Icon } from "../icons.ts";
import { useMe } from "../session.ts";
import { de } from "../text/de.ts";

const AREAS: { key: keyof typeof de.areas; icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { key: "einkauf", icon: Icon.Einkauf },
  { key: "todos", icon: Icon.Todos },
  { key: "kalender", icon: Icon.Kalender },
  { key: "geburtstage", icon: Icon.Geburtstage },
  { key: "dokumente", icon: Icon.Dokumente },
  { key: "essensplan", icon: Icon.Essensplan },
];

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
        <section className="board" aria-labelledby="board-h">
          <div className="board-head">
            <h2 id="board-h">{de.home.board}</h2>
            <span>0 neu</span>
          </div>
          <p className="board-empty">{de.home.boardEmpty}</p>
        </section>
        <section aria-labelledby="areas-h">
          <div className="sechead">
            <h2 id="areas-h">{de.home.areas}</h2>
          </div>
          <div className="areas">
            {AREAS.map(({ key, icon: I }) => (
              <div key={key} className="area is-soon">
                <I className="ico" aria-hidden="true" />
                <b>{de.areas[key]}</b>
                <small>{de.areas.soon}</small>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
