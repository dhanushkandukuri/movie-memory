import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { prismaFactStore } from "./prisma-store";

// get-fact.test.ts covers the logic against an in-memory store. These check
// that the real queries are scoped the same way.
vi.mock("@/lib/db", () => ({
  prisma: {
    movieFact: { findFirst: vi.fn() },
    factGenerationLock: { deleteMany: vi.fn() },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("prismaFactStore", () => {
  it("only looks up the user's own facts", async () => {
    await prismaFactStore.findLatestFact("alice", "Inception");

    expect(prisma.movieFact.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "alice", movieTitle: "Inception" },
        orderBy: { createdAt: "desc" },
      }),
    );
  });

  it("only releases the lock if this request still holds it", async () => {
    await prismaFactStore.releaseLock("alice", "token-1");

    expect(prisma.factGenerationLock.deleteMany).toHaveBeenCalledWith({
      where: { userId: "alice", token: "token-1" },
    });
  });
});
