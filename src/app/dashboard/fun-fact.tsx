import { createMovieFact } from "@/lib/facts";
import { RefreshFactButton } from "./refresh-fact-button";

type FunFactProps = {
  userId: string;
  movieTitle: string;
};

export async function FunFact({ userId, movieTitle }: FunFactProps) {
  let fact: Awaited<ReturnType<typeof createMovieFact>>;
  try {
    fact = await createMovieFact(userId, movieTitle);
  } catch (error) {
    // Just the message: the full OpenAI error includes response headers we don't want in logs.
    console.error("[fun-fact] generation failed:", error instanceof Error ? error.message : error);
    return (
      <div className="space-y-4">
        <p className="text-zinc-600 dark:text-zinc-400">
          We couldn&apos;t come up with a fun fact right now. Please try again in a moment.
        </p>
        <RefreshFactButton label="Try again" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-lg leading-relaxed">{fact.content}</p>
      <RefreshFactButton label="Get another fact" />
    </div>
  );
}

export function FunFactSkeleton() {
  return (
    <div className="animate-pulse space-y-2" aria-label="Loading a fun fact">
      <div className="h-4 w-full rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-4 w-11/12 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-4 w-2/3 rounded bg-zinc-200 dark:bg-zinc-800" />
    </div>
  );
}
