// Stub for user identity — backed by Auth.js JWT session.
// Replace getUserId() call sites stay unchanged since signature is the same.
import type { NextRequest } from "next/server";
import { auth } from "@/auth";

export class AuthError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "AuthError";
  }
}

export async function getUserId(_req: NextRequest): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new AuthError();
  return session.user.id;
}
