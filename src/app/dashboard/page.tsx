import { SignOutButton } from "@/components/auth-buttons";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";

export default async function DashboardPage() {
  const userId = await requireUserId();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  });

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <SignOutButton />
      </div>
      <p>Signed in as {user?.name ?? user?.email ?? "you"}.</p>
    </main>
  );
}
