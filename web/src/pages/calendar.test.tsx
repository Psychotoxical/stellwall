import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { alex, fakeApi, renderAt, sam } from "../test-utils.tsx";
import { de } from "../text/de.ts";
import { addDays, todayYmd } from "../calendar-api.ts";
import { simpleRule } from "@stellwall/shared";

afterEach(() => vi.unstubAllGlobals());

const today = todayYmd();
const local = (time: string) => new Date(`${today}T${time}`).toISOString();
const inst = (o: Record<string, unknown> = {}) => ({
  kind: "event", eventId: "e1", date: today, start: local("15:30"), end: local("16:30"), allDay: false, endDate: today,
  title: "Zahnarzt", location: "", forWhom: ["s1"], series: false, createdBy: "a1", changed: false, ...o,
});
const dto = (o: Record<string, unknown> = {}) => ({
  id: "e1", title: "Zahnarzt", location: "", notes: "", allDay: false, start: local("15:30"), end: local("16:30"), startDate: today, endDate: today,
  rrule: null, forWhom: ["s1"], seeAll: false, createdBy: "a1", reminders: [], imported: false, ...o,
});

function base(cal: unknown[] = [], more: Record<string, (b: unknown) => { status: number; body: unknown }> = {}) {
  return {
    "GET /api/me": () => ({ status: 200, body: alex }),
    "GET /api/members": () => ({ status: 200, body: [alex, sam] }),
    "GET /api/board": () => ({ status: 200, body: [] }),
    "GET /api/todos?*": () => ({ status: 200, body: [] }),
    "GET /api/calendar?*": () => ({ status: 200, body: cal }),
    "GET /api/birthdays": () => ({ status: 200, body: [] }),
    ...more,
  };
}

describe("calendar page", () => {
  it("shows the day's events and birthdays with the age", async () => {
    fakeApi(base([inst(), { kind: "birthday", birthdayId: "b1", date: today, start: local("00:00"), allDay: true, endDate: today, title: "Oma", age: 77 }]));
    renderAt("/kalender");
    const day = await screen.findByRole("region", { name: /heute|.+/i, hidden: false });
    expect(await within(day).findByText("Zahnarzt")).toBeInTheDocument();
    expect(within(day).getByText("Oma")).toBeInTheDocument();
    expect(within(day).getByText(de.calendar.turns(77))).toBeInTheDocument();
  });

  it("all-day hides the time fields", async () => {
    fakeApi(base());
    renderAt("/kalender");
    fireEvent.click(await screen.findByRole("button", { name: de.calendar.new }));
    expect(await screen.findByLabelText(de.calendar.from + " " + de.calendar.time)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: de.calendar.allDay }));
    expect(screen.queryByLabelText(de.calendar.from + " " + de.calendar.time)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(de.calendar.to + " " + de.calendar.time)).not.toBeInTheDocument();
  });

  it("new event posts who it is for", async () => {
    const calls = fakeApi(base([], { "POST /api/events": (b) => ({ status: 200, body: { ...dto(), ...(b as object) } }) }));
    renderAt("/kalender");
    fireEvent.click(await screen.findByRole("button", { name: de.calendar.new }));
    fireEvent.change(await screen.findByLabelText(de.calendar.title), { target: { value: "Elternabend" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Sam/ }));
    fireEvent.click(screen.getByRole("button", { name: de.members.save }));
    await waitFor(() => expect(calls.find((c) => c.key === "POST /api/events")?.body).toMatchObject({ title: "Elternabend", allDay: false, forWhom: ["a1", "s1"], seeAll: false, rrule: null }));
  });

  it("a single event saves without the series question", async () => {
    const calls = fakeApi(base([inst()], { "GET /api/events/e1": () => ({ status: 200, body: dto() }), "PATCH /api/events/e1?scope=all": (b) => ({ status: 200, body: { ...dto(), ...(b as object) } }) }));
    renderAt("/kalender");
    fireEvent.click(await screen.findByRole("button", { name: /Zahnarzt/ }));
    fireEvent.change(await screen.findByLabelText(de.calendar.title), { target: { value: "Zahnarzt Kontrolle" } });
    fireEvent.click(screen.getByRole("button", { name: de.members.save }));
    await waitFor(() => expect(calls.find((c) => c.key === "PATCH /api/events/e1?scope=all")?.body).toEqual({ title: "Zahnarzt Kontrolle" }));
    expect(screen.queryByText(de.calendar.scopes.one)).not.toBeInTheDocument();
  });

  it("a series asks which occurrences change", async () => {
    const calls = fakeApi(base([inst({ series: true })], {
      "GET /api/events/e1": () => ({ status: 200, body: dto({ rrule: "FREQ=WEEKLY" }) }),
      "PATCH /api/events/e1?*": (b) => ({ status: 200, body: { ...dto(), ...(b as object) } }),
    }));
    renderAt("/kalender");
    fireEvent.click(await screen.findByRole("button", { name: /Zahnarzt/ }));
    fireEvent.change(await screen.findByLabelText(de.calendar.title), { target: { value: "Training" } });
    fireEvent.click(screen.getByRole("button", { name: de.members.save }));
    fireEvent.click(await screen.findByRole("button", { name: de.calendar.scopes.one }));
    await waitFor(() => expect(calls.find((c) => c.key === `PATCH /api/events/e1?scope=one&date=${today}`)?.body).toEqual({ title: "Training" }));
  });
});

describe("calendar import", () => {
  it("shows a preview, then the result", async () => {
    const calls = fakeApi(base([], {
      "POST /api/import/preview": () => ({ status: 200, body: { token: "00000000-0000-4000-8000-000000000001", count: 3, fromToday: 2, first: "2026-01-05", last: "2026-12-24", sample: [{ title: "Chorprobe", date: "2026-11-02", allDay: false, series: true }] } }),
      "POST /api/import/commit": () => ({ status: 200, body: { added: 2, skipped: 0 } }),
    }));
    renderAt("/kalender/import");
    const file = new File(["BEGIN:VCALENDAR\nEND:VCALENDAR\n"], "privat.ics", { type: "text/calendar" });
    fireEvent.change(await screen.findByLabelText(de.import.file), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: de.import.preview }));
    expect(await screen.findByText(de.import.found(3))).toBeInTheDocument();
    expect(screen.getByText("Chorprobe")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: de.import.doImport }));
    expect(await screen.findByText(de.import.done(2))).toBeInTheDocument();
    expect(calls.find((c) => c.key === "POST /api/import/commit")?.body).toEqual({ token: "00000000-0000-4000-8000-000000000001", from: "today", visibility: { everyone: false, memberIds: ["a1"] } });
  });
});

describe("home with calendar", () => {
  it("the board says who entered an event for me", async () => {
    fakeApi({ ...base(), "GET /api/board": () => ({ status: 200, body: [{ kind: "event", who: "s1", whoName: "Sam", eventId: "e1", title: "Zahnarzt", start: local("15:30"), allDay: false, latestAt: new Date().toISOString() }] }) });
    renderAt("/");
    expect(await screen.findByText(new RegExp("Sam hat dir einen Termin eingetragen: Zahnarzt"))).toBeInTheDocument();
  });

  it("today for me lists my events", async () => {
    fakeApi(base([inst({ forWhom: ["a1"] })]));
    renderAt("/");
    expect(await screen.findByText("Zahnarzt")).toBeInTheDocument();
  });
});

describe("calendar review fixes", () => {
  it("a moved occurrence shows on the day it now takes place", async () => {
    fakeApi(base([inst({ date: addDays(today, -3), series: true, changed: true })]));
    renderAt("/kalender");
    const day = await screen.findByRole("region");
    expect(await within(day).findByText("Zahnarzt")).toBeInTheDocument();
  });

  it("moving a weekly series to another day moves its weekday too", async () => {
    const calls = fakeApi(base([inst({ series: true })], {
      "GET /api/events/e1": () => ({ status: 200, body: dto({ rrule: simpleRule("weekly", today) }) }),
      "PATCH /api/events/e1?*": (b) => ({ status: 200, body: { ...dto(), ...(b as object) } }),
    }));
    renderAt("/kalender");
    fireEvent.click(await screen.findByRole("button", { name: /Zahnarzt/ }));
    fireEvent.change(await screen.findByLabelText(de.calendar.from + " " + de.calendar.date), { target: { value: addDays(today, 1) } });
    fireEvent.click(screen.getByRole("button", { name: de.members.save }));
    fireEvent.click(await screen.findByRole("button", { name: de.calendar.scopes.all }));
    await waitFor(() => expect(calls.find((c) => c.key.startsWith("PATCH /api/events/e1?scope=all"))?.body).toMatchObject({ rrule: simpleRule("weekly", addDays(today, 1)) }));
  });

  it("a change that only fits the whole series does not offer just this one", async () => {
    fakeApi(base([inst({ series: true })], { "GET /api/events/e1": () => ({ status: 200, body: dto({ rrule: "FREQ=WEEKLY" }) }) }));
    renderAt("/kalender");
    fireEvent.click(await screen.findByRole("button", { name: /Zahnarzt/ }));
    fireEvent.change(await screen.findByLabelText(de.calendar.notes), { target: { value: "Karte mitnehmen" } });
    fireEvent.click(screen.getByRole("button", { name: de.members.save }));
    expect(await screen.findByRole("button", { name: de.calendar.scopes.following })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: de.calendar.scopes.one })).not.toBeInTheDocument();
  });
});

describe("compact week", () => {
  it("empty days take no words, a day with events lists them beside its date", async () => {
    fakeApi(base([inst()]));
    renderAt("/kalender");
    fireEvent.click(await screen.findByRole("button", { name: de.calendar.views.week }));
    expect(await screen.findByRole("button", { name: /Zahnarzt/ })).toBeInTheDocument();
    expect(screen.queryByText(de.calendar.dayEmpty)).not.toBeInTheDocument();
    expect(document.querySelectorAll(".agendaday").length).toBe(7);
  });

  it("an empty week says so once", async () => {
    fakeApi(base([]));
    renderAt("/kalender");
    fireEvent.click(await screen.findByRole("button", { name: de.calendar.views.week }));
    expect(await screen.findByText(de.calendar.weekEmpty)).toBeInTheDocument();
  });
});
