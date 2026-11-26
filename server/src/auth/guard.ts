import type { FastifyReply, FastifyRequest } from "fastify";
import type { MemberDto } from "@stellwall/shared";

declare module "fastify" {
  interface FastifyRequest {
    member: MemberDto | null;
    sessionId: string | null;
  }
}

export async function requireMember(req: FastifyRequest, reply: FastifyReply) {
  if (!req.member) return reply.code(401).send({ error: "unauthenticated" });
}

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  if (!req.member) return reply.code(401).send({ error: "unauthenticated" });
  if (req.member.role !== "admin") return reply.code(403).send({ error: "forbidden" });
}

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

/** Block cross-site state changes: custom header required, Origin must match when sent. */
export function csrfCheck(publicUrl: string) {
  const allowed = new URL(publicUrl).origin;
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (SAFE.has(req.method) || !req.url.startsWith("/api/")) return;
    const origin = req.headers.origin;
    if (req.headers["x-stellwall"] !== "1" || (origin && origin !== allowed)) {
      return reply.code(403).send({ error: "csrf" });
    }
  };
}
