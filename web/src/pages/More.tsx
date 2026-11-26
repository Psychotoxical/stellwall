import { Link } from "react-router";
import { Icon } from "../icons.ts";
import { useMe } from "../session.ts";
import { de } from "../text/de.ts";
import { Header } from "./Home.tsx";

export function More() {
  const me = useMe().data!;
  return (
    <>
      <Header title={de.nav.mehr} />
      <div className="areas" style={{ maxWidth: 640 }}>
        {me.role === "admin" && (
          <Link to="/mitglieder" className="area">
            <Icon.Members className="ico" aria-hidden="true" />
            <b>{de.nav.members}</b>
            <small />
          </Link>
        )}
        <Link to="/benachrichtigungen" className="area">
          <Icon.Bell className="ico" aria-hidden="true" />
          <b>{de.notify.page}</b>
          <small />
        </Link>
        <Link to="/essen" className="area">
          <Icon.Essensplan className="ico" aria-hidden="true" />
          <b>{de.meals.page}</b>
          <small />
        </Link>
        {me.role === "admin" && (
          <Link to="/mealie" className="area">
            <Icon.Settings className="ico" aria-hidden="true" />
            <b>{de.mealie.page}</b>
            <small />
          </Link>
        )}
        <Link to="/konto" className="area">
          <Icon.Account className="ico" aria-hidden="true" />
          <b>{de.nav.account}</b>
          <small />
        </Link>
      </div>
      <div className="sechead"><h2>Über Stellwall</h2></div>
      <p className="lead">{de.about.version(__APP_VERSION__)}</p>
      <p className="lead">
        Icons: Solar von 480 Design, Lizenz{" "}
        <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>.
      </p>
      <p className="lead">
        Wiederholungen: rrule, Lizenz{" "}
        <a href="https://github.com/jkbrzt/rrule/blob/master/LICENCE" target="_blank" rel="noreferrer">BSD-3-Clause</a>. Kalender-Import: ical.js, Lizenz{" "}
        <a href="https://www.mozilla.org/MPL/2.0/" target="_blank" rel="noreferrer">MPL 2.0</a>, Quellcode auf{" "}
        <a href="https://github.com/kewisch/ical.js" target="_blank" rel="noreferrer">GitHub</a>.
      </p>
    </>
  );
}
