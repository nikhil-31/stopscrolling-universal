import { useState, type ReactNode } from "react";

export function AppIcon({
  iconUrl,
  fallback,
}: {
  iconUrl?: string | null;
  fallback: ReactNode;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!iconUrl || failedUrl === iconUrl) return fallback;
  return (
    <img
      className="app-icon"
      alt=""
      src={iconUrl}
      onError={() => setFailedUrl(iconUrl)}
    />
  );
}
