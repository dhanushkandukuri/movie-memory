import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SignOutButton } from "@/components/auth-buttons";
import { UserAvatar } from "@/components/user-avatar";
import { requireUserId } from "@/lib/session";
import { getUserProfile } from "@/lib/users";
import { FunFact, FunFactSkeleton } from "./fun-fact";

export default async function DashboardPage() {
  const userId = await requireUserId();
  const user = await getUserProfile(userId);

  // First-time users land here straight after Google sign-in.
  if (!user?.favoriteMovie) redirect("/onboarding");

  // Google doesn't always give us a name, so fall back to the email handle.
  const displayName = user.name?.trim() || user.email?.split("@")[0] || "Movie fan";

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-4">
          <span className="font-semibold tracking-tight">Movie Memory</span>
          <SignOutButton />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
        <section className="flex items-center gap-4 rounded-2xl border border-zinc-200 p-6 dark:border-zinc-800">
          <UserAvatar name={user.name} email={user.email} image={user.image} size={64} />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold">{displayName}</h1>
            {user.email && (
              <p className="truncate text-sm text-zinc-600 dark:text-zinc-400">{user.email}</p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 p-6 dark:border-zinc-800">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            Favorite movie
          </h2>
          <p className="mt-2 break-words text-2xl font-semibold">{user.favoriteMovie}</p>
        </section>

        <section className="rounded-2xl border border-zinc-200 p-6 dark:border-zinc-800">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">
            Fun fact
          </h2>
          {/* The OpenAI call can take a few seconds, so stream it in instead of
              holding up the rest of the page. */}
          <Suspense fallback={<FunFactSkeleton />}>
            <FunFact userId={userId} movieTitle={user.favoriteMovie} />
          </Suspense>
        </section>
      </main>
    </div>
  );
}
