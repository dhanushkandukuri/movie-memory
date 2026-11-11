"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

// Re-renders the dashboard on the server, which asks for a new fact.
export function RefreshFactButton({ label }: { label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      disabled={pending}
      className="shrink-0 rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium transition hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
    >
      {pending ? "Thinking…" : label}
    </button>
  );
}
