import { FACT_ERROR_MESSAGES, getFact } from "@/lib/facts";
import { getSessionUserId } from "@/lib/session";

const ERROR_STATUS = {
  no_movie: 409,
  generation_failed: 503,
  busy: 503,
} as const;

// Returns the signed-in user's current fun fact. There is deliberately no
// userId (or fact id) parameter: the user always comes from the session.
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return json({ error: "You need to sign in first." }, 401);
  }

  const result = await getFact(userId);
  if (!result.ok) {
    return json({ error: FACT_ERROR_MESSAGES[result.error] }, ERROR_STATUS[result.error]);
  }

  const { fact, source } = result;
  return json({
    fact: {
      content: fact.content,
      movieTitle: fact.movieTitle,
      createdAt: fact.createdAt.toISOString(),
    },
    source,
  });
}

function json(body: unknown, status = 200) {
  // Per-user data, so no browser or CDN should ever cache it.
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
