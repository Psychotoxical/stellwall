import type { FastifyInstance, FastifyReply } from "fastify";
import multipart from "@fastify/multipart";
import { and, asc, desc, eq, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { Transform } from "node:stream";
import { z } from "zod";
import type { Db } from "../db/client.ts";
import { documentMembers, documents } from "../db/schema.ts";
import { requireMember } from "../auth/guard.ts";
import type { Notifier } from "../shopping/notify.ts";
import { UnreadableError, decryptFrom, encryptTo } from "./crypto.ts";

export const MAX_BYTES = 30 * 1024 * 1024;
export const REMIND_DAYS = [7, 30, 90] as const;
export const DEFAULT_CATEGORIES = ["Versicherung", "Auto", "Gesundheit", "Verträge", "Ausweise", "Haus", "Schule/Arbeit", "Finanzen"];

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const visibilitySchema = z.object({ everyone: z.boolean(), memberIds: z.array(z.uuid()).max(50) });
const nameSchema = z.string().trim().min(1).max(120);
const categorySchema = z.string().trim().min(1).max(40).nullable();
const remindSchema = z.union([z.literal(7), z.literal(30), z.literal(90)]);
const metaSchema = z.object({ name: nameSchema, category: categorySchema.default(null), validUntil: dateSchema.nullable().default(null), remindDays: remindSchema.default(30), visibility: visibilitySchema });
const patchSchema = z.object({ name: nameSchema.optional(), category: categorySchema.optional(), validUntil: dateSchema.nullable().optional(), remindDays: remindSchema.optional(), visibility: visibilitySchema.optional() });
const listQuery = z.object({ q: z.string().max(200).optional(), category: z.string().max(40).optional() });
const idParam = z.object({ id: z.uuid() });

type Row = typeof documents.$inferSelect;
export type DocumentDto = {
  id: string;
  name: string;
  category: string | null;
  validUntil: string | null;
  remindDays: number;
  visibility: { everyone: boolean; memberIds: string[] };
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  mime: string;
  size: number;
  pages: number | null;
  ocr: "pending" | "done" | "failed";
  snippet?: string;
};

/** The type is read from the first bytes, never from the file name. */
export function sniff(head: Buffer): string | null {
  if (head.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  return null;
}

const EXT: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };

/** Each word as a German prefix query: "Versich" finds "Versicherung", "Versicherungen" its stem. */
export function searchQuery(q: string): string | null {
  const words = q.normalize("NFC").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.length ? words.slice(0, 8).map((w) => `${w}:*`).join(" & ") : null;
}

/** The 32-byte key: raw bytes or 64 hex characters. Null when missing or malformed. */
export async function readKey(file: string | null): Promise<Buffer | null> {
  if (!file) return null;
  try {
    const raw = await readFile(file);
    if (raw.length === 32) return raw;
    const hex = raw.toString("utf8").trim();
    return /^[0-9a-f]{64}$/i.test(hex) ? Buffer.from(hex, "hex") : null;
  } catch {
    return null;
  }
}

export function documentVisibleTo(memberId: string) {
  return or(
    eq(documents.everyone, true),
    sql`exists (select 1 from ${documentMembers} where ${documentMembers.documentId} = ${documents.id} and ${documentMembers.memberId} = ${memberId})`,
  )!;
}

export async function documentMemberIds(db: Db, id: string): Promise<string[]> {
  return (await db.select({ id: documentMembers.memberId }).from(documentMembers).where(eq(documentMembers.documentId, id))).map((r) => r.id);
}

/** Who may see the document: null means everyone. */
export async function documentAudience(db: Db, id: string): Promise<string[] | null> {
  const row = (await db.select({ everyone: documents.everyone }).from(documents).where(eq(documents.id, id)).limit(1))[0];
  if (!row) return [];
  return row.everyone ? null : documentMemberIds(db, id);
}

export type DocumentsOpts = {
  db: Db;
  now: () => Date;
  notify: Notifier;
  dir: string | null;
  key: Buffer | null;
  /** A new file is waiting for its text. */
  onStored?: (id: string) => void;
};

export async function documentRoutes(app: FastifyInstance, opts: DocumentsOpts) {
  const { db, now, notify, dir, key } = opts;
  if (dir && key) await mkdir(dir, { recursive: true });
  await app.register(multipart, { limits: { fileSize: MAX_BYTES, files: 1, fields: 4, fieldSize: 10_000 } });

  const ready = (reply: FastifyReply) => {
    if (dir && key) return { dir, key };
    void reply.code(409).send({ error: "documents_not_configured" });
    return null;
  };

  async function setMembers(id: string, everyone: boolean, memberIds: string[], creator: string) {
    await db.delete(documentMembers).where(eq(documentMembers.documentId, id));
    if (everyone) return;
    const ids = [...new Set([...memberIds, creator])];
    await db.insert(documentMembers).values(ids.map((memberId) => ({ documentId: id, memberId })));
  }

  async function toDto(r: Row, snippet?: string | null): Promise<DocumentDto> {
    return {
      id: r.id,
      name: r.name,
      category: r.category,
      validUntil: r.validUntil,
      remindDays: r.remindDays,
      visibility: { everyone: r.everyone, memberIds: r.everyone ? [] : await documentMemberIds(db, r.id) },
      createdBy: r.createdBy,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      mime: r.mime,
      size: r.size,
      pages: r.pages,
      ocr: r.ocrState,
      ...(snippet ? { snippet } : {}),
    };
  }

  async function findVisible(id: string, me: string) {
    return (await db.select().from(documents).where(and(eq(documents.id, id), documentVisibleTo(me))).limit(1))[0] ?? null;
  }

  app.post("/api/documents", { preHandler: requireMember, bodyLimit: MAX_BYTES + 1_000_000 }, async (req, reply) => {
    const store = ready(reply);
    if (!store) return reply;
    if (!req.isMultipart()) return reply.code(400).send({ error: "invalid_input" });
    const me = req.member!.id;
    const id = randomUUID();
    const path = join(store.dir, id);
    let meta: z.infer<typeof metaSchema> | null = null;
    let mime: string | null = null;
    let size = 0;
    try {
      for await (const part of req.parts()) {
        if (part.type === "field") {
          if (part.fieldname !== "meta") continue;
          const parsed = metaSchema.safeParse((() => { try { return JSON.parse(String(part.value)); } catch { return null; } })());
          if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
          meta = parsed.data;
          continue;
        }
        if (!meta || part.fieldname !== "file") {
          part.file.resume();
          return reply.code(400).send({ error: "invalid_input" });
        }
        let checked = false;
        const gate = new Transform({
          transform(chunk: Buffer, _e, done) {
            if (!checked) {
              checked = true;
              mime = sniff(chunk);
              if (!mime) return done(new Error("unsupported_type"));
            }
            done(null, chunk);
          },
        });
        size = (await encryptTo(path, part.file.pipe(gate), store.key)).size;
        if (part.file.truncated) throw Object.assign(new Error("too_large"), { code: "FST_REQ_FILE_TOO_LARGE" });
      }
    } catch (e) {
      await rm(path, { force: true });
      const err = e as { message?: string; code?: string };
      if (err.code === "FST_REQ_FILE_TOO_LARGE" || err.code === "FST_FILES_LIMIT") return reply.code(413).send({ error: "too_large" });
      if (err.message === "unsupported_type") return reply.code(415).send({ error: "unsupported_type" });
      throw e;
    }
    if (!meta || !mime || size === 0) {
      await rm(path, { force: true });
      return reply.code(400).send({ error: "invalid_input" });
    }
    const at = now();
    const [row] = await db
      .insert(documents)
      .values({ id, name: meta.name, category: meta.category, validUntil: meta.validUntil, remindDays: meta.remindDays, everyone: meta.visibility.everyone, createdBy: me, createdAt: at, updatedAt: at, mime, size })
      .returning();
    await setMembers(id, meta.visibility.everyone, meta.visibility.memberIds, me);
    notify.documents(id);
    opts.onStored?.(id);
    return toDto(row!);
  });

  app.get("/api/documents", { preHandler: requireMember }, async (req, reply) => {
    if (!ready(reply)) return reply;
    const q = listQuery.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.member!.id;
    const tsq = q.data.q ? searchQuery(q.data.q) : null;
    const conds = [documentVisibleTo(me)];
    if (q.data.category) conds.push(eq(documents.category, q.data.category));
    if (tsq) {
      const query = sql`to_tsquery('german', ${tsq})`;
      const plain = sql`to_tsquery('simple', ${tsq})`;
      const rows = await db
        .select({ doc: documents, snippet: sql<string>`ts_headline('german', coalesce(${documents.text}, ''), ${query}, 'MaxWords=14, MinWords=6, StartSel=«, StopSel=», MaxFragments=1')` })
        .from(documents)
        .where(and(...conds, sql`(${documents.search} @@ ${query} or ${documents.searchPlain} @@ ${plain})`))
        .orderBy(sql`ts_rank(${documents.search}, ${query}) desc`, desc(documents.updatedAt))
        .limit(100);
      return Promise.all(rows.map((r) => toDto(r.doc, r.doc.text && r.snippet.includes("«") ? r.snippet : null)));
    }
    const rows = await db.select().from(documents).where(and(...conds)).orderBy(desc(documents.updatedAt), asc(documents.name)).limit(500);
    return Promise.all(rows.map((r) => toDto(r)));
  });

  app.get("/api/document-categories", { preHandler: requireMember }, async (req) => {
    const used = await db.selectDistinct({ c: documents.category }).from(documents).where(documentVisibleTo(req.member!.id));
    const extra = used.map((u) => u.c).filter((c): c is string => !!c && !DEFAULT_CATEGORIES.includes(c)).sort((a, b) => a.localeCompare(b, "de"));
    return [...DEFAULT_CATEGORIES, ...extra];
  });

  app.get("/api/documents/:id", { preHandler: requireMember }, async (req, reply) => {
    if (!ready(reply)) return reply;
    const p = idParam.safeParse(req.params);
    const row = p.success ? await findVisible(p.data.id, req.member!.id) : null;
    if (!row) return reply.code(404).send({ error: "not_found" });
    return toDto(row);
  });

  app.get("/api/documents/:id/file", { preHandler: requireMember }, async (req, reply) => {
    const store = ready(reply);
    if (!store) return reply;
    const p = idParam.safeParse(req.params);
    const row = p.success ? await findVisible(p.data.id, req.member!.id) : null;
    if (!row) return reply.code(404).send({ error: "not_found" });
    // Read whole (at most 30 MB) so a wrong key answers with an error, not with half a file.
    const parts: Buffer[] = [];
    try {
      for await (const c of decryptFrom(join(store.dir, row.id), store.key)) parts.push(c as Buffer);
    } catch (e) {
      if (e instanceof UnreadableError || (e as { code?: string }).code === "ENOENT") return reply.code(500).send({ error: "document_unreadable" });
      throw e;
    }
    const download = (req.query as { download?: string }).download === "1";
    const file = `${row.name}.${EXT[row.mime] ?? "bin"}`;
    return reply
      .header("content-type", row.mime)
      .header("cache-control", "private, no-store")
      .header("x-content-type-options", "nosniff")
      .header("content-disposition", `${download ? "attachment" : "inline"}; filename="${file.replace(/[^\x20-\x7e]|"/g, "_")}"; filename*=UTF-8''${encodeURIComponent(file)}`)
      .send(Buffer.concat(parts));
  });

  app.patch("/api/documents/:id", { preHandler: requireMember }, async (req, reply) => {
    if (!ready(reply)) return reply;
    const p = idParam.safeParse(req.params);
    const b = patchSchema.safeParse(req.body);
    const me = req.member!.id;
    const row = p.success ? await findVisible(p.data.id, me) : null;
    if (!row) return reply.code(404).send({ error: "not_found" });
    if (!b.success) return reply.code(400).send({ error: "invalid_input" });
    if (b.data.visibility && row.createdBy !== me) return reply.code(403).send({ error: "not_creator" });
    const { visibility, ...fields } = b.data;
    // Who could see it before hears about the change too.
    const before = row.everyone ? null : await documentMemberIds(db, row.id);
    const [updated] = await db
      .update(documents)
      .set({ ...fields, ...(visibility ? { everyone: visibility.everyone } : {}), updatedAt: now() })
      .where(eq(documents.id, row.id))
      .returning();
    if (visibility) await setMembers(row.id, visibility.everyone, visibility.memberIds, row.createdBy);
    notify.documentsGone(before);
    notify.documents(row.id);
    return toDto(updated!);
  });

  app.delete("/api/documents/:id", { preHandler: requireMember }, async (req, reply) => {
    const store = ready(reply);
    if (!store) return reply;
    const p = idParam.safeParse(req.params);
    const me = req.member!.id;
    const row = p.success ? await findVisible(p.data.id, me) : null;
    if (!row) return reply.code(404).send({ error: "not_found" });
    if (row.createdBy !== me) return reply.code(403).send({ error: "not_creator" });
    const audience = row.everyone ? null : await documentMemberIds(db, row.id);
    await db.delete(documents).where(eq(documents.id, row.id));
    await rm(join(store.dir, row.id), { force: true });
    notify.documentsGone(audience);
    return { ok: true };
  });
}
