import Fastify from "fastify";

export const TOKEN = "test-token-not-real-0123456789";

type FakeCategory = { id: string; slug: string; name: string };
export const CATEGORIES: FakeCategory[] = [
  { id: "c-haupt", slug: "hauptgericht", name: "Hauptgericht" },
  { id: "c-backen", slug: "backen", name: "Backen" },
  { id: "c-indisch", slug: "indisch", name: "Indisch" },
];
type FakeRecipe = { id: string; slug: string; name: string; recipeServings: number; image: string | null; recipeCategory?: FakeCategory[]; recipeIngredient: { quantity: number; unit: { name: string; abbreviation: string } | null; food: { name: string } | null; note: string; originalText: string }[]; recipeInstructions: { text: string }[] };

const baseRecipes: FakeRecipe[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "gemuese-pfanne",
    name: "Gemüsepfanne",
    recipeServings: 4,
    image: "abc",
    recipeCategory: [CATEGORIES[0]!],
    recipeIngredient: [
      { quantity: 200, unit: { name: "Gramm", abbreviation: "g" }, food: { name: "Reis" }, note: "", originalText: "200 g Reis" },
      { quantity: 1.5, unit: { name: "Esslöffel", abbreviation: "EL" }, food: { name: "Öl" }, note: "", originalText: "1 ½ EL Öl" },
      { quantity: 0, unit: null, food: null, note: "Für das Gemüse:", originalText: "" },
      { quantity: 0, unit: null, food: null, note: "2 Paprika, in Streifen", originalText: "" },
      { quantity: 0, unit: null, food: { name: "Salz" }, note: "", originalText: "Salz" },
    ],
    recipeInstructions: [{ text: "Reis kochen." }, { text: "Gemüse anbraten und würzen." }],
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    slug: "pfannkuchen",
    name: "Pfannkuchen",
    recipeServings: 2,
    image: null,
    recipeCategory: [CATEGORIES[1]!, CATEGORIES[0]!],
    recipeIngredient: [
      { quantity: 250, unit: { name: "Gramm", abbreviation: "g" }, food: { name: "Mehl" }, note: "", originalText: "" },
      { quantity: 3, unit: null, food: { name: "Eier" }, note: "", originalText: "" },
      { quantity: 1, unit: { name: "Esslöffel", abbreviation: "EL" }, food: { name: "Öl" }, note: "", originalText: "" },
    ],
    recipeInstructions: [{ text: "Alles verrühren." }],
  },
];
// More recipes than fit on one page, like a real collection.
for (let n = 1; n <= 30; n++) baseRecipes.push({ id: `33333333-3333-4333-8333-${String(n).padStart(12, "0")}`, slug: `testrezept-${n}`, name: `Testrezept ${n}`, recipeServings: 4, image: null, recipeIngredient: [], recipeInstructions: [] });

/** A stand-in for Mealie on a local port: just enough of its API for Stellwall. */
export async function startFakeMealie(opts: { slow?: boolean; port?: number; failAi?: boolean; readOnly?: boolean } = {}) {
  const app = Fastify({ logger: false });
  // Each fake Mealie has its own collection, so recipes one test makes stay out of the next.
  const recipes = baseRecipes.map((r) => ({ ...r }));
  const calls: string[] = [];
  app.addHook("onRequest", async (req, reply) => {
    calls.push(req.url);
    if (opts.slow) await new Promise((r) => setTimeout(r, 1500));
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return reply.code(401).send({ detail: "Unauthorized" });
    // A token of a Mealie user who may only read.
    if (opts.readOnly && req.method !== "GET") return reply.code(403).send({ detail: "Forbidden" });
  });
  app.get("/api/recipes", async (req) => {
    const query = req.query as { search?: string; perPage?: string };
    const q = String(query.search ?? "").toLowerCase();
    const perPage = Number(query.perPage) || 50;
    const items = recipes.filter((r) => r.name.toLowerCase().includes(q)).map(({ recipeIngredient: _i, recipeInstructions: _s, ...r }) => r);
    return { page: 1, per_page: perPage, total: items.length, total_pages: Math.ceil(items.length / perPage), items: items.slice(0, perPage) };
  });
  app.get("/api/recipes/:slug", async (req, reply) => {
    const r = recipes.find((x) => x.slug === (req.params as { slug: string }).slug);
    return r ?? reply.code(404).send({ detail: "not found" });
  });
  app.get("/api/organizers/categories", async () => ({ page: 1, total: CATEGORIES.length, items: CATEGORIES }));
  // Mealie takes the full category objects and keeps them as they are sent.
  app.patch("/api/recipes/:slug", async (req, reply) => {
    const r = recipes.find((x) => x.slug === (req.params as { slug: string }).slug);
    if (!r) return reply.code(404).send({ detail: "not found" });
    const body = req.body as { recipeCategory?: FakeCategory[] };
    if (body.recipeCategory) r.recipeCategory = body.recipeCategory;
    return r;
  });
  // Imports: a link, or any mix of text and images for its AI. Each makes a recipe and answers with its slug.
  const created: { kind: string; url?: string; content?: string; images: number }[] = [];
  const newRecipe = (name: string) => {
    const n = created.length;
    const slug = `neu-${n}`;
    recipes.push({ id: `44444444-4444-4444-8444-${String(n).padStart(12, "0")}`, slug, name, recipeServings: 0, image: null, recipeIngredient: [{ quantity: 0, unit: null, food: null, note: "450 g Mehl und Mehl zum Arbeiten", originalText: "" }], recipeInstructions: [{ text: "Backen." }] });
    return slug;
  };
  app.post("/api/recipes/create/url", async (req, reply) => {
    const url = (req.body as { url?: string }).url ?? "";
    if (url.includes("kaputt")) return reply.code(400).send({ detail: { message: "Unable to parse" } });
    const slug = newRecipe("Aus dem Netz");
    created.push({ kind: "url", url, images: 0 });
    return reply.code(201).send(JSON.stringify(slug));
  });
  app.addContentTypeParser(/^multipart\/form-data/, { parseAs: "buffer" }, (_req, body, done) => done(null, body));
  app.post("/api/recipes/create/ai", async (req, reply) => {
    const raw = (req.body as Buffer).toString("utf8");
    const images = (raw.match(/name="images"/g) ?? []).length;
    const content = /name="content"\r\n\r\n([\s\S]*?)\r\n--/.exec(raw)?.[1];
    if (opts.failAi) return reply.code(400).send({ detail: { message: "OpenAI Request Failed" } });
    const slug = newRecipe(content ? "Aus dem Text" : "Aus dem Foto");
    created.push({ kind: "ai", content, images });
    return reply.code(201).send(JSON.stringify(slug));
  });
  app.get("/api/media/recipes/:id/images/min-original.webp", async (_req, reply) => reply.type("image/webp").send(Buffer.from("RIFFfakeWEBP")));
  await app.listen({ port: opts.port ?? 0, host: "127.0.0.1" });
  const port = (app.server.address() as { port: number }).port;
  return { url: `http://127.0.0.1:${port}`, calls, created, close: () => app.close() };
}
