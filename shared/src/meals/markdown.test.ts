import { describe, expect, it } from "vitest";
import { inlineMarks } from "./markdown.ts";

describe("inlineMarks", () => {
  it("reads bold from a step as Mealie stores it", () => {
    expect(inlineMarks("In einer Schüssel **250 g weiche Butter** mit **2 Eiern** verrühren.")).toEqual([
      { text: "In einer Schüssel ", bold: false, italic: false },
      { text: "250 g weiche Butter", bold: true, italic: false },
      { text: " mit ", bold: false, italic: false },
      { text: "2 Eiern", bold: true, italic: false },
      { text: " verrühren.", bold: false, italic: false },
    ]);
  });

  it("reads __bold__ and *italic*", () => {
    expect(inlineMarks("__Tipp:__ *kalt* stellen")).toEqual([
      { text: "Tipp:", bold: true, italic: false },
      { text: " ", bold: false, italic: false },
      { text: "kalt", bold: false, italic: true },
      { text: " stellen", bold: false, italic: false },
    ]);
  });

  it("leaves lone stars and plain text as they are", () => {
    expect(inlineMarks("2 * 3 Teile, **offen")).toEqual([{ text: "2 * 3 Teile, **offen", bold: false, italic: false }]);
    expect(inlineMarks("")).toEqual([]);
  });
});
