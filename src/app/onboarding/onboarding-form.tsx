"use client";

import { useActionState } from "react";
import { MOVIE_TITLE_MAX_LENGTH } from "@/lib/movie-title";
import { saveFavoriteMovie, type OnboardingState } from "./actions";

const initialState: OnboardingState = {};

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState(saveFavoriteMovie, initialState);

  return (
    <form action={formAction} className="flex w-full flex-col gap-3">
      <label htmlFor="favoriteMovie" className="text-sm font-medium">
        Favorite movie
      </label>
      {/* required/maxLength are just a nicer UX, the server action re-validates everything */}
      <input
        id="favoriteMovie"
        name="favoriteMovie"
        type="text"
        required
        maxLength={MOVIE_TITLE_MAX_LENGTH}
        defaultValue={state.value}
        placeholder="e.g. Spirited Away"
        autoComplete="off"
        autoFocus
        aria-invalid={state.error ? true : undefined}
        aria-describedby={state.error ? "favoriteMovie-error" : undefined}
        className="rounded-lg border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:ring-zinc-800"
      />
      {state.error && (
        <p id="favoriteMovie-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-lg bg-zinc-900 px-4 py-3 font-medium text-white transition hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {pending ? "Saving…" : "Save and continue"}
      </button>
    </form>
  );
}
