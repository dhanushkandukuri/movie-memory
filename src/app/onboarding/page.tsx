import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/session";
import { getUserProfile } from "@/lib/users";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const userId = await requireUserId();
  const user = await getUserProfile(userId);

  // Onboarding only happens once.
  if (user?.favoriteMovie) redirect("/dashboard");

  const firstName = user?.name?.trim().split(/\s+/)[0];

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-12">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          {firstName ? `Welcome, ${firstName}!` : "Welcome!"}
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          What&apos;s your favorite movie? We&apos;ll use it to find you fun facts.
        </p>
      </div>
      <OnboardingForm />
    </main>
  );
}
