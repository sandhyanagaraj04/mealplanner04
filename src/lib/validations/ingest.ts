import { z } from "zod";

export const IngestUrlSchema = z.object({
  type: z.literal("url"),
  url: z.string().url("Must be a valid URL"),
});

export const IngestTextSchema = z.object({
  type: z.literal("text"),
  text: z.string().min(10, "Text must be at least 10 characters"),
});

export const IngestSchema = z.discriminatedUnion("type", [IngestUrlSchema, IngestTextSchema]);

// When confirming, the user can override the title and servings before the
// Recipe is created (in case the parser got them wrong).
export const ConfirmIngestionSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  servings: z.number().int().min(1).max(500).optional(),
  description: z.string().max(2000).optional(),
});

export type IngestInput = z.infer<typeof IngestSchema>;
export type ConfirmIngestionInput = z.infer<typeof ConfirmIngestionSchema>;
