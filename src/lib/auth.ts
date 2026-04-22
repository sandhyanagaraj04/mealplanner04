// Stub for user identity. Replace with real session/JWT logic when auth is added.
// All API routes call getUserId() — no route touches a user ID directly.

import type { NextRequest } from "next/server";
import { db } from "@/lib/db";

const TEST_USER_ID = "cltest000000000000000000000";

// Upserts the test user on first call per serverless instance so the app works
// without a separate seed step.
let ensured = false;

export async function getUserId(_req: NextRequest): Promise<string> {
  if (!ensured) {
    await db.user.upsert({
      where: { id: TEST_USER_ID },
      create: { id: TEST_USER_ID, email: "dev@example.com", name: "Dev User" },
      update: {},
    });
    ensured = true;
  }
  return TEST_USER_ID;
}

export { TEST_USER_ID };
