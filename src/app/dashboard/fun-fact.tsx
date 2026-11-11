import { FACT_ERROR_MESSAGES, getFact, type FactSource } from "@/lib/facts";
import { RefreshFactButton } from "./refresh-fact-button";

const SOURCE_NOTES: Record<FactSource, string> = {
  generated: "Fresh from the projector.",
  cache: "New facts are available once a minute, so this is your latest one.",
  fallback: "We couldn't get a new fact just now, so here's your most recent one.",
};

export async function FunFact({ userId }: { userId: string }) {
  const result = await getFact(userId);

  if (!result.ok) {
    return (
      <div className="space-y-4">
        <p className="text-zinc-600 dark:text-zinc-400">{FACT_ERROR_MESSAGES[result.error]}</p>
        <RefreshFactButton label="Try again" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-lg leading-relaxed">{result.fact.content}</p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-zinc-500">{SOURCE_NOTES[result.source]}</p>
        <RefreshFactButton label="Get another fact" />
      </div>
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
