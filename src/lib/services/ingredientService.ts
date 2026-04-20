import { db } from "@/lib/db";
import type { Ingredient } from "@/generated/prisma/client";
import type { IngredientCreate, IngredientUpdate } from "@/lib/validations/ingredient";

// ─── Search ───────────────────────────────────────────────────────────────────

export async function searchIngredients(q: string, limit = 10): Promise<Ingredient[]> {
  const term = q.toLowerCase().trim();
  return db.ingredient.findMany({
    where: {
      OR: [
        { name: { contains: term, mode: "insensitive" } },
        // aliases is a String[] — PostgreSQL array contains
        { aliases: { has: term } },
      ],
    },
    take: limit,
    orderBy: { name: "asc" },
  });
}

// ─── Exact match (used by the parser to auto-link) ────────────────────────────

export async function findIngredientByName(name: string): Promise<Ingredient | null> {
  const term = name.toLowerCase().trim();
  // Try canonical name first
  const byName = await db.ingredient.findUnique({ where: { name: term } });
  if (byName) return byName;

  // Then check aliases
  return db.ingredient.findFirst({
    where: { aliases: { has: term } },
  });
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function createIngredient(data: IngredientCreate): Promise<Ingredient> {
  return db.ingredient.create({
    data: {
      name: data.name,
      aliases: data.aliases,
      category: data.category,
    },
  });
}

export async function updateIngredient(
  id: string,
  data: IngredientUpdate
): Promise<Ingredient | null> {
  try {
    return await db.ingredient.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.aliases !== undefined && { aliases: data.aliases }),
        ...(data.category !== undefined && { category: data.category }),
      },
    });
  } catch {
    return null;
  }
}

export async function getIngredient(id: string): Promise<Ingredient | null> {
  return db.ingredient.findUnique({ where: { id } });
}

// ─── Find-or-create (used during recipe import) ───────────────────────────────

export async function findOrCreateIngredient(
  name: string,
  category?: string
): Promise<Ingredient> {
  const term = name.toLowerCase().trim();
  const existing = await findIngredientByName(term);
  if (existing) return existing;

  return db.ingredient.create({
    data: { name: term, aliases: [], category: category ?? null },
  });
}
