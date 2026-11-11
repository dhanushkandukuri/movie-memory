import "server-only";
import { generateMovieFact } from "@/lib/openai";
import { getFactForUser, type FactResult } from "./get-fact";
import { prismaFactStore } from "./prisma-store";

export type { Fact, FactResult, FactSource } from "./get-fact";

export function getFact(userId: string): Promise<FactResult> {
  return getFactForUser(userId, { store: prismaFactStore, generateFact: generateMovieFact });
}

type FactError = Extract<FactResult, { ok: false }>["error"];

export const FACT_ERROR_MESSAGES: Record<FactError, string> = {
  no_movie: "Pick a favorite movie first.",
  generation_failed: "We couldn't come up with a fun fact right now. Please try again in a moment.",
  busy: "Your fun fact is still being written. Please try again in a few seconds.",
};
