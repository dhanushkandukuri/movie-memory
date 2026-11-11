import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import type { FactStore } from "./get-fact";

const factFields = { id: true, movieTitle: true, content: true, createdAt: true } as const;

export const prismaFactStore: FactStore = {
  async getFavoriteMovie(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { favoriteMovie: true },
    });
    return user?.favoriteMovie ?? null;
  },

  findLatestFact(userId, movieTitle) {
    // Served by the (userId, movieTitle, createdAt DESC) index.
    return prisma.movieFact.findFirst({
      where: { userId, movieTitle },
      orderBy: { createdAt: "desc" },
      select: factFields,
    });
  },

  saveFact(data) {
    return prisma.movieFact.create({ data, select: factFields });
  },

  async acquireLock(userId, token, expiresAt, now) {
    // 1. Take over a lock whose holder crashed or timed out. If two requests
    //    race here, Postgres row locking makes the second one re-check
    //    `expiresAt` after the first commits, so it updates nothing.
    const takeover = await prisma.factGenerationLock.updateMany({
      where: { userId, expiresAt: { lte: now } },
      data: { token, expiresAt },
    });
    if (takeover.count === 1) return true;

    // 2. No lock row yet. userId is the primary key, so when two requests
    //    race, exactly one insert succeeds and the other gets P2002.
    try {
      await prisma.factGenerationLock.create({ data: { userId, token, expiresAt } });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return false;
      }
      throw error;
    }
  },

  async isLocked(userId, now) {
    const lock = await prisma.factGenerationLock.findUnique({
      where: { userId },
      select: { expiresAt: true },
    });
    return lock !== null && lock.expiresAt > now;
  },

  async releaseLock(userId, token) {
    // Matching on the token means we never delete a lock another request took over.
    await prisma.factGenerationLock.deleteMany({ where: { userId, token } });
  },
};
