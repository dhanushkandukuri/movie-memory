import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { CACHE_WINDOW_MS, LOCK_TTL_MS, getFactForUser, type Fact, type FactStore } from "./get-fact";

type StoredFact = Fact & { userId: string };

// In-memory version of the Prisma store with the same rules: facts are looked
// up by (userId, movieTitle), and a lock is held until it's released or expires.
function createMemoryStore() {
  const favoriteMovies = new Map<string, string>();
  const facts: StoredFact[] = [];
  const locks = new Map<string, { token: string; expiresAt: Date }>();

  const store: FactStore = {
    async getFavoriteMovie(userId) {
      return favoriteMovies.get(userId) ?? null;
    },
    async findLatestFact(userId, movieTitle) {
      const latest = facts
        .filter((f) => f.userId === userId && f.movieTitle === movieTitle)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      return latest ? toFact(latest) : null;
    },
    async saveFact(data) {
      const fact = { id: `fact-${facts.length + 1}`, ...data };
      facts.push(fact);
      return toFact(fact);
    },
    async acquireLock(userId, token, expiresAt, now) {
      const lock = locks.get(userId);
      if (lock && lock.expiresAt > now) return false;
      locks.set(userId, { token, expiresAt });
      return true;
    },
    async isLocked(userId, now) {
      const lock = locks.get(userId);
      return lock !== undefined && lock.expiresAt > now;
    },
    async releaseLock(userId, token) {
      if (locks.get(userId)?.token === token) locks.delete(userId);
    },
  };

  return { store, favoriteMovies, facts, locks };
}

function toFact({ id, movieTitle, content, createdAt }: StoredFact): Fact {
  return { id, movieTitle, content, createdAt };
}

const yieldToEventLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

let db: ReturnType<typeof createMemoryStore>;
let time: number;
let generateFact: Mock<(movieTitle: string) => Promise<string>>;

const now = () => new Date(time);
const advance = (ms: number) => {
  time += ms;
};

// Waiting requests poll with sleep(). Move the fake clock forward and give the
// other in-flight requests a turn.
async function sleep(ms: number) {
  advance(ms);
  await yieldToEventLoop();
}

function getFact(userId: string) {
  return getFactForUser(userId, { store: db.store, generateFact, now, sleep });
}

function lockHeldByAnotherRequest(userId: string) {
  return db.store.acquireLock(userId, "other-request", new Date(time + LOCK_TTL_MS), now());
}

beforeEach(() => {
  db = createMemoryStore();
  time = new Date("2026-11-11T12:00:00Z").getTime();

  let calls = 0;
  generateFact = vi.fn(async (movieTitle: string) => {
    // Like a real API call, finish on a later turn of the event loop so
    // parallel requests actually overlap.
    await yieldToEventLoop();
    return `Fun fact #${++calls} about ${movieTitle}`;
  });

  // Failures are logged on purpose; keep the test output clean.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getFactForUser", () => {
  it("asks for a favorite movie before generating anything", async () => {
    expect(await getFact("alice")).toEqual({ ok: false, error: "no_movie" });
    expect(generateFact).not.toHaveBeenCalled();
  });

  describe("60 second cache", () => {
    beforeEach(() => {
      db.favoriteMovies.set("alice", "Inception");
    });

    it("generates and stores a fact the first time", async () => {
      const result = await getFact("alice");

      expect(result).toMatchObject({
        ok: true,
        source: "generated",
        fact: { movieTitle: "Inception", content: "Fun fact #1 about Inception" },
      });
      expect(generateFact).toHaveBeenCalledExactlyOnceWith("Inception");
      expect(db.facts).toHaveLength(1);
      expect(db.locks.size).toBe(0);
    });

    it("reuses the fact for requests within 60 seconds", async () => {
      await getFact("alice");
      advance(CACHE_WINDOW_MS - 1);

      const result = await getFact("alice");

      expect(result).toMatchObject({
        ok: true,
        source: "cache",
        fact: { content: "Fun fact #1 about Inception" },
      });
      expect(generateFact).toHaveBeenCalledTimes(1);
      expect(db.facts).toHaveLength(1);
    });

    it("generates a new fact once the last one is 60 seconds old", async () => {
      await getFact("alice");
      advance(CACHE_WINDOW_MS);

      const result = await getFact("alice");

      expect(result).toMatchObject({
        ok: true,
        source: "generated",
        fact: { content: "Fun fact #2 about Inception" },
      });
      expect(db.facts).toHaveLength(2);
    });

    it("keeps a separate cache per movie", async () => {
      await getFact("alice");
      db.favoriteMovies.set("alice", "Heat");

      const result = await getFact("alice");

      expect(result).toMatchObject({ ok: true, source: "generated", fact: { movieTitle: "Heat" } });
      expect(generateFact).toHaveBeenLastCalledWith("Heat");
    });
  });

  describe("bursts of requests", () => {
    beforeEach(() => {
      db.favoriteMovies.set("alice", "Inception");
    });

    it("calls OpenAI once when several requests arrive together", async () => {
      const results = await Promise.all([1, 2, 3, 4, 5].map(() => getFact("alice")));

      expect(generateFact).toHaveBeenCalledTimes(1);
      expect(results.map((r) => r.ok && r.source).sort()).toEqual([
        "cache",
        "cache",
        "cache",
        "cache",
        "generated",
      ]);
      expect(results.every((r) => r.ok && r.fact.id === db.facts[0].id)).toBe(true);
      expect(db.facts).toHaveLength(1);
      expect(db.locks.size).toBe(0);
    });

    it("checks the cache again after taking the lock", async () => {
      // Another tab saves a fact (and lets go of the lock) right after this
      // request's first cache check came back empty.
      vi.spyOn(db.store, "findLatestFact").mockImplementationOnce(async () => {
        await db.store.saveFact({
          userId: "alice",
          movieTitle: "Inception",
          content: "From the other tab",
          createdAt: now(),
        });
        return null;
      });

      const result = await getFact("alice");

      expect(result).toMatchObject({ ok: true, source: "cache", fact: { content: "From the other tab" } });
      expect(generateFact).not.toHaveBeenCalled();
    });

    it("picks up the fact from the request it was waiting on", async () => {
      await lockHeldByAnotherRequest("alice");
      const findLatestFact = db.store.findLatestFact;
      vi.spyOn(db.store, "findLatestFact")
        .mockImplementationOnce(findLatestFact)
        .mockImplementationOnce(async (userId, movieTitle) => {
          const fact = await findLatestFact(userId, movieTitle);
          // The other request saves its fact and lets go of the lock right
          // after this read. The waiter must not mistake that for a failure.
          await db.store.saveFact({
            userId: "alice",
            movieTitle: "Inception",
            content: "From the other tab",
            createdAt: now(),
          });
          await db.store.releaseLock("alice", "other-request");
          return fact;
        });

      const result = await getFact("alice");

      expect(result).toMatchObject({ ok: true, source: "cache", fact: { content: "From the other tab" } });
      expect(generateFact).not.toHaveBeenCalled();
    });

    it("takes over a lock left behind by a request that crashed", async () => {
      await lockHeldByAnotherRequest("alice");
      advance(LOCK_TTL_MS);

      expect(await getFact("alice")).toMatchObject({ ok: true, source: "generated" });
      expect(db.locks.size).toBe(0);
    });

    it("gives up if the other request never finishes", async () => {
      await lockHeldByAnotherRequest("alice");

      expect(await getFact("alice")).toEqual({ ok: false, error: "busy" });
      expect(generateFact).not.toHaveBeenCalled();
    });

    it("returns the previous fact if the other request never finishes", async () => {
      await getFact("alice");
      advance(CACHE_WINDOW_MS);
      await lockHeldByAnotherRequest("alice");

      expect(await getFact("alice")).toMatchObject({
        ok: true,
        source: "fallback",
        fact: { content: "Fun fact #1 about Inception" },
      });
    });
  });

  describe("when OpenAI fails", () => {
    beforeEach(() => {
      db.favoriteMovies.set("alice", "Inception");
    });

    it("falls back to the most recent fact", async () => {
      await getFact("alice");
      advance(CACHE_WINDOW_MS + 5_000);
      generateFact.mockRejectedValue(new Error("OpenAI is down"));

      const result = await getFact("alice");

      expect(result).toMatchObject({
        ok: true,
        source: "fallback",
        fact: { content: "Fun fact #1 about Inception" },
      });
      expect(db.facts).toHaveLength(1);
      expect(db.locks.size).toBe(0);
    });

    it("returns an error when there's no fact to fall back to", async () => {
      generateFact.mockRejectedValue(new Error("OpenAI is down"));

      expect(await getFact("alice")).toEqual({ ok: false, error: "generation_failed" });
      expect(db.facts).toHaveLength(0);
      expect(db.locks.size).toBe(0);
    });

    it("doesn't make the waiting requests call OpenAI again", async () => {
      generateFact.mockImplementation(async () => {
        await yieldToEventLoop();
        throw new Error("OpenAI is down");
      });

      const results = await Promise.all([1, 2, 3].map(() => getFact("alice")));

      expect(generateFact).toHaveBeenCalledTimes(1);
      expect(results).toEqual(Array(3).fill({ ok: false, error: "generation_failed" }));
    });
  });

  describe("authorization", () => {
    beforeEach(() => {
      db.favoriteMovies.set("alice", "Inception");
      db.favoriteMovies.set("bob", "Inception");
    });

    it("never returns another user's fact, even for the same movie", async () => {
      await getFact("alice");

      const result = await getFact("bob");

      expect(result).toMatchObject({
        ok: true,
        source: "generated",
        fact: { content: "Fun fact #2 about Inception" },
      });
      expect(db.facts.map((f) => f.userId)).toEqual(["alice", "bob"]);
    });

    it("doesn't fall back to another user's fact", async () => {
      await getFact("alice");
      generateFact.mockRejectedValue(new Error("OpenAI is down"));

      expect(await getFact("bob")).toEqual({ ok: false, error: "generation_failed" });
    });

    it("isn't blocked by another user's lock", async () => {
      await lockHeldByAnotherRequest("alice");

      expect(await getFact("bob")).toMatchObject({ ok: true, source: "generated" });
    });
  });
});
