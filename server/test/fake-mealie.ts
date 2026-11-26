import Fastify from "fastify";

export const TOKEN = "test-token-not-real-0123456789";

const recipes = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "gemuese-pfanne",
    name: "Gemüsepfanne",
    recipeServings: 4,
    image: "abc",
    recipeIngredient: [
      { quantity: 200, unit: { name: "Gramm", abbreviation: "g" }, food: { name: "Reis" }, note: "", originalText: "200 g Reis" },
      { quantity: 1.5, unit: { name: "Esslöffel", abbreviation: "EL" }, food: { name: "Öl" }, note: "", originalText: "1 ½ EL Öl" },
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
    recipeIngredient: [
      { quantity: 250, unit: { name: "Gramm", abbreviation: "g" }, food: { name: "Mehl" }, note: "", originalText: "" },
      { quantity: 3, unit: null, food: { name: "Eier" }, note: "", originalText: "" },
      { quantity: 1, unit: { name: "Esslöffel", abbreviation: "EL" }, food: { name: "Öl" }, note: "", originalText: "" },
    ],
    recipeInstructions: [{ text: "Alles verrühren." }],
  },
];

/** A stand-in for Mealie on a local port: just enough of its API for Stellwall. */
export async function startFakeMealie(opts: { slow?: boolean; port?: number } = {}) {
  const app = Fastify({ logger: false });
  const calls: string[] = [];
  app.addHook("onRequest", async (req, reply) => {
    calls.push(req.url);
    if (opts.slow) await new Promise((r) => setTimeout(r, 1500));
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return reply.code(401).send({ detail: "Unauthorized" });
  });
  app.get("/api/recipes", async (req) => {
    const q = String((req.query as { search?: string }).search ?? "").toLowerCase();
    const items = recipes.filter((r) => r.name.toLowerCase().includes(q)).map(({ recipeIngredient: _i, recipeInstructions: _s, ...r }) => r);
    return { page: 1, per_page: 24, total: items.length, total_pages: 1, items };
  });
  app.get("/api/recipes/:slug", async (req, reply) => {
    const r = recipes.find((x) => x.slug === (req.params as { slug: string }).slug);
    return r ?? reply.code(404).send({ detail: "not found" });
  });
  app.get("/api/media/recipes/:id/images/min-original.webp", async (_req, reply) => reply.type("image/webp").send(Buffer.from("RIFFfakeWEBP")));
  await app.listen({ port: opts.port ?? 0, host: "127.0.0.1" });
  const port = (app.server.address() as { port: number }).port;
  return { url: `http://127.0.0.1:${port}`, calls, close: () => app.close() };
}
