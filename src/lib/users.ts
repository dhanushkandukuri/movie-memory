import "server-only";
import { prisma } from "@/lib/db";

export function getUserProfile(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, image: true, favoriteMovie: true },
  });
}

// Onboarding is one-time, so this only writes when no movie is set yet. The
// check and the write happen in a single UPDATE, which means a double submit
// or a second tab can't overwrite a movie that was already saved.
export async function setInitialFavoriteMovie(userId: string, title: string) {
  const { count } = await prisma.user.updateMany({
    where: { id: userId, favoriteMovie: null },
    data: { favoriteMovie: title },
  });
  return count === 1;
}
