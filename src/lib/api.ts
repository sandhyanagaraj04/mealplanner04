import { NextResponse } from "next/server";
import type { ZodError } from "zod";

// ─── Response helpers ──────────────────────────────────────────────────────────

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, data }, { status });
}

export function created<T>(data: T): NextResponse {
  return NextResponse.json({ ok: true, data }, { status: 201 });
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

export function badRequest(error: string, details?: unknown): NextResponse {
  return NextResponse.json({ ok: false, error, details }, { status: 400 });
}

export function notFound(resource = "Resource"): NextResponse {
  return NextResponse.json({ ok: false, error: `${resource} not found` }, { status: 404 });
}

export function conflict(error: string): NextResponse {
  return NextResponse.json({ ok: false, error }, { status: 409 });
}

export function forbidden(error = "Forbidden"): NextResponse {
  return NextResponse.json({ ok: false, error }, { status: 403 });
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

export function serverError(error: unknown): NextResponse {
  if (error instanceof Error && error.name === "AuthError") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const message = error instanceof Error ? error.message : "Internal server error";
  console.error("[API error]", error);
  return NextResponse.json({ ok: false, error: message }, { status: 500 });
}

// ─── Zod validation helper ─────────────────────────────────────────────────────

export function validationError(err: ZodError): NextResponse {
  return badRequest("Validation failed", err.flatten().fieldErrors);
}

// ─── Pagination helper ─────────────────────────────────────────────────────────

export function parsePagination(
  searchParams: URLSearchParams,
  defaults = { limit: 20, maxLimit: 100 }
): { limit: number; offset: number } {
  const limit = Math.min(
    Math.max(1, parseInt(searchParams.get("limit") ?? String(defaults.limit))),
    defaults.maxLimit
  );
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0"));
  return { limit, offset };
}

// ─── Prisma unique constraint helper ──────────────────────────────────────────

export function isPrismaUniqueError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "P2002"
  );
}

export function isPrismaForeignKeyError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "P2003"
  );
}

export function isPrismaNotFoundError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "P2025"
  );
}
