import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SignInButton } from "@/components/auth-buttons";

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 text-center">
      <div className="space-y-3">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Movie Memory</h1>
        <p className="mx-auto max-w-md text-zinc-600 dark:text-zinc-400">
          Tell us your favorite movie and we&apos;ll dig up a fun fact about it.
        </p>
      </div>
      <SignInButton />
    </main>
  );
}
