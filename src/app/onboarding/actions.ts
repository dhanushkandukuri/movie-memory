"use server";

import { redirect } from "next/navigation";
import { movieTitleSchema } from "@/lib/movie-title";
import { requireUserId } from "@/lib/session";
import { setInitialFavoriteMovie } from "@/lib/users";

export type OnboardingState = {
  error?: string;
  // echoed back so the input keeps what the user typed after an error
  value?: string;
};

export async function saveFavoriteMovie(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const userId = await requireUserId();

  const raw = formData.get("favoriteMovie");
  const value = typeof raw === "string" ? raw : "";
  const parsed = movieTitleSchema.safeParse(value);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, value };
  }

  // false means a movie was already saved (e.g. from another tab). Either way
  // the user is onboarded now, so the dashboard is the right place to go.
  await setInitialFavoriteMovie(userId, parsed.data);
  redirect("/dashboard");
}
