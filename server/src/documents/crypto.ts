import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { open, rm } from "node:fs/promises";
import { PassThrough, Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

/**
 * A document on disk: "SWD1", a 12-byte IV, the AES-256-GCM ciphertext, the 16-byte tag.
 * Every file gets its own IV; the key comes from DOCS_KEY_FILE and never sits next to the files.
 */
const MAGIC = Buffer.from("SWD1");
const IV = 12;
const TAG = 16;
const HEAD = MAGIC.length + IV;

/** The file was changed, belongs to another key or is no document at all. */
export class UnreadableError extends Error {
  constructor() {
    super("document_unreadable");
  }
}

/** Writes the source encrypted to path; a failed write leaves no file behind. */
export async function encryptTo(path: string, source: Readable, key: Buffer): Promise<{ size: number }> {
  const iv = randomBytes(IV);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const out = createWriteStream(path, { flags: "wx", mode: 0o600 });
  let size = 0;
  const count = new Transform({
    transform(chunk: Buffer, _enc, done) {
      size += chunk.length;
      done(null, chunk);
    },
  });
  try {
    out.write(Buffer.concat([MAGIC, iv]));
    await pipeline(source, count, cipher, out, { end: false });
    await new Promise<void>((resolve, reject) => out.end(cipher.getAuthTag(), (e?: Error | null) => (e ? reject(e) : resolve())));
    return { size };
  } catch (e) {
    out.destroy();
    await rm(path, { force: true });
    throw e;
  }
}

/** Reads a document back; a wrong key or a changed byte ends the stream with UnreadableError. */
export function decryptFrom(path: string, key: Buffer): Readable {
  const out = new PassThrough();
  void (async () => {
    const fh = await open(path, "r");
    let head: Buffer;
    let tag: Buffer;
    let size: number;
    try {
      size = (await fh.stat()).size;
      if (size < HEAD + TAG) throw new UnreadableError();
      head = Buffer.alloc(HEAD);
      tag = Buffer.alloc(TAG);
      await fh.read(head, 0, HEAD, 0);
      await fh.read(tag, 0, TAG, size - TAG);
    } finally {
      await fh.close();
    }
    if (!head.subarray(0, MAGIC.length).equals(MAGIC)) throw new UnreadableError();
    const decipher = createDecipheriv("aes-256-gcm", key, head.subarray(MAGIC.length));
    decipher.setAuthTag(tag);
    const body = size - HEAD - TAG;
    const source = body > 0 ? createReadStream(path, { start: HEAD, end: HEAD + body - 1 }) : Readable.from([]);
    // Not pipeline(): it would end `out` with the cipher's own error instead of ours.
    const fail = () => out.destroy(new UnreadableError());
    source.on("error", fail);
    decipher.on("error", fail);
    source.pipe(decipher).pipe(out);
  })().catch((e) => out.destroy(e instanceof UnreadableError ? e : new UnreadableError()));
  return out;
}
