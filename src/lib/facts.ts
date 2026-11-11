import "server-only";
import { prisma } from "@/lib/db";
import { generateMovieFact } from "@/lib/openai";

// Generates a brand new fact on every call and saves it, so we keep a history
// of everything shown to the user.
export async function createMovieFact(userId: string, movieTitle: string) {
  const content = await generateMovieFact(movieTitle);
  return prisma.movieFact.create({
    data: { userId, movieTitle, content },
    select: { content: true },
  });
}
