import type { Session } from "next-auth";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { auth } from "@/auth";
import { getFact } from "@/lib/facts";
import { GET } from "./route";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/facts", () => ({
  getFact: vi.fn(),
  FACT_ERROR_MESSAGES: {
    no_movie: "Pick a movie",
    generation_failed: "Try again later",
    busy: "Still working on it",
  },
}));

// `auth` is overloaded (it doubles as middleware), so give the mock a plain type.
const mockAuth = auth as unknown as Mock<() => Promise<Session | null>>;
const mockGetFact = vi.mocked(getFact);

function signInAs(userId: string | null) {
  mockAuth.mockResolvedValue(
    userId ? { user: { id: userId }, expires: "2099-01-01T00:00:00.000Z" } : null,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("GET /api/fact", () => {
  it("returns 401 and never looks up facts when signed out", async () => {
    signInAs(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mockGetFact).not.toHaveBeenCalled();
  });

  it("only ever looks up facts for the signed-in user", async () => {
    signInAs("alice");
    mockGetFact.mockResolvedValue({
      ok: true,
      source: "cache",
      fact: {
        id: "fact-1",
        movieTitle: "Inception",
        content: "The spinning top was a real prop.",
        createdAt: new Date("2026-11-11T12:00:00Z"),
      },
    });

    // GET doesn't take the request at all today. Pass one with someone else's
    // id anyway, so this fails if the handler ever starts reading it.
    const handler: (request: Request) => Promise<Response> = GET;
    const response = await handler(new Request("http://localhost/api/fact?userId=bob"));

    expect(mockGetFact).toHaveBeenCalledExactlyOnceWith("alice");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      fact: {
        movieTitle: "Inception",
        content: "The spinning top was a real prop.",
        createdAt: "2026-11-11T12:00:00.000Z",
      },
      source: "cache",
    });
  });

  it("returns a friendly 503 when no fact could be generated", async () => {
    signInAs("alice");
    mockGetFact.mockResolvedValue({ ok: false, error: "generation_failed" });

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Try again later" });
  });
});
