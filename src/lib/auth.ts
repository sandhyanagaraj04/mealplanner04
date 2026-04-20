// Stub for user identity. Replace with real session/JWT logic when auth is added.
// All API routes call getUserId() — no route touches a user ID directly.

import type { NextRequest } from "next/server";

// Fixed test user — matches the ID seeded by prisma/seed.ts
const TEST_USER_ID = "cltest000000000000000000000";

export async function getUserId(_req: NextRequest): Promise<string> {
  // TODO: extract from session cookie or Authorization Bearer token
  return TEST_USER_ID;
}

export { TEST_USER_ID };
