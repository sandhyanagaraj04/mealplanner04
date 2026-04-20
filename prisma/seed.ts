import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const TEST_USER_ID = "cltest000000000000000000000";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const adapter = new PrismaPg({ connectionString });
  const db = new PrismaClient({ adapter });

  await db.user.upsert({
    where: { id: TEST_USER_ID },
    create: {
      id: TEST_USER_ID,
      email: "dev@example.com",
      name: "Dev User",
    },
    update: {},
  });

  console.log("Seed complete — dev user:", TEST_USER_ID);
  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
