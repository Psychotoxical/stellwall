import { NavLink, Outlet } from "react-router";
import type { ComponentType, SVGProps } from "react";
import { Icon } from "../icons.ts";
import { de } from "../text/de.ts";
import { ConnectionBanner } from "./ConnectionBanner.tsx";
import { UpdateBanner } from "./UpdateBanner.tsx";
import { Wordmark } from "./Wordmark.tsx";

type Item = { to: string; label: string; icon: ComponentType<SVGProps<SVGSVGElement>>; ready: boolean };

// Five tabs fit even narrow phones; everything else sits behind the round picture top right.
const ITEMS: Item[] = [
  { to: "/", label: de.nav.start, icon: Icon.Start, ready: true },
  { to: "/einkauf", label: de.nav.einkauf, icon: Icon.Einkauf, ready: true },
  { to: "/kalender", label: de.nav.kalender, icon: Icon.Kalender, ready: true },
  { to: "/essen", label: de.nav.essen, icon: Icon.Essensplan, ready: true },
  { to: "/todos", label: de.nav.todos, icon: Icon.Todos, ready: true },
];
const RAIL_EXTRA: Item[] = [{ to: "/mehr", label: de.nav.mehr, icon: Icon.Mehr, ready: true }];

function NavItems({ rail }: { rail: boolean }) {
  return (
    <>
      {(rail ? [...ITEMS, ...RAIL_EXTRA] : ITEMS).map(({ to, label, icon: I, ready }) =>
        ready ? (
          <NavLink key={to} to={to} end={to === "/"} className="navitem">
            <I aria-hidden="true" className="ico" />
            <span>{label}</span>
            {!rail && <span className="navdot" />}
          </NavLink>
        ) : (
          <span key={to} className="navitem is-soon" aria-disabled="true" title={de.areas.soon}>
            <I aria-hidden="true" className="ico" />
            <span>{label}</span>
            {!rail && <span className="navdot" />}
          </span>
        ),
      )}
    </>
  );
}

export function Shell() {
  return (
    <div className="shell">
      <nav className="rail" aria-label="Bereiche">
        <div className="brand"><Wordmark size={"md"} /></div>
        <NavItems rail />
      </nav>
      <div className="content">
        <UpdateBanner />
        <ConnectionBanner />
        <main className="main">
          <Outlet />
        </main>
      </div>
      <nav className="tabs" aria-label="Bereiche">
        <NavItems rail={false} />
      </nav>
    </div>
  );
}
