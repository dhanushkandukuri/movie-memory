import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

// The user id always comes from the session cookie, never from the request,
// so one user can't ask for another user's data by changing a param.
export async function getSessionUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

// For pages: send signed-out visitors back to the landing page.
export async function requireUserId(): Promise<string> {
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  return userId;
}
