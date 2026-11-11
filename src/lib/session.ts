import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

// The user id always comes from the session cookie, never from the request,
// so one user can't ask for another user's data by changing a param.
export async function requireUserId(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/");
  return userId;
}
