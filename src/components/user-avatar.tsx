"use client";

import { useState } from "react";

type UserAvatarProps = {
  name: string | null;
  email: string | null;
  image: string | null;
  size?: number;
};

export function UserAvatar({ name, email, image, size = 64 }: UserAvatarProps) {
  // Google photo URLs can expire or 403, so fall back to initials on error too,
  // not just when there's no image at all.
  const [failed, setFailed] = useState(false);
  const dimensions = { width: size, height: size };

  if (image && !failed) {
    return (
      // A plain <img> is enough for a small avatar that's already on Google's
      // CDN, and it avoids having to allow-list image hosts for next/image.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt=""
        {...dimensions}
        style={dimensions}
        // Google's image CDN sometimes rejects requests with a localhost referrer.
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        // The <img> is server-rendered, so it can fail before React hydrates and
        // attaches onError. Catch that case when the ref is attached.
        ref={(img) => {
          if (img?.complete && img.naturalWidth === 0) setFailed(true);
        }}
        className="shrink-0 rounded-full object-cover"
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      style={{ ...dimensions, fontSize: size * 0.38 }}
      className="flex shrink-0 items-center justify-center rounded-full bg-zinc-200 font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
    >
      {getInitials(name, email)}
    </div>
  );
}

function getInitials(name: string | null, email: string | null) {
  const words = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (words.length > 0) {
    const first = words[0][0];
    const last = words.length > 1 ? words[words.length - 1][0] : "";
    return (first + last).toUpperCase();
  }
  return email?.[0]?.toUpperCase() ?? "?";
}
