import type { InstalledApplication } from "./types";

/** File the system icon is read from. macOS icons live on the .app bundle, not the inner binary. */
export function applicationIconFilePath(executablePath: string, platform: string): string | null {
  const executable = executablePath.trim();
  if (!executable) return null;
  if (platform === "darwin") {
    const lower = executable.toLowerCase();
    const marker = ".app/";
    const index = lower.indexOf(marker);
    if (index !== -1) return executable.slice(0, index + 4);
    if (lower.endsWith(".app")) return executable;
  }
  return executable;
}

function isWindowsPath(filePath: string) {
  return filePath.includes("\\") || /^[A-Za-z]:[\\/]/.test(filePath);
}

/** Path segments stay slashes so Chromium does not rewrite an encoded `%2F`. */
export function applicationIconUrl(filePath: string): string {
  if (isWindowsPath(filePath)) {
    const segments = filePath.replaceAll("\\", "/").split("/").filter(Boolean).map(encodeURIComponent);
    return `app-icon://file/${segments.join("/")}`;
  }
  return `app-icon://bundle${filePath.split("/").map(encodeURIComponent).join("/")}`;
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function applicationIconPathFromUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "app-icon:") return null;
  if (parsed.hostname === "bundle") return safeDecode(parsed.pathname);
  if (parsed.hostname === "file") {
    const decoded = safeDecode(parsed.pathname.replace(/^\/+/, ""));
    return decoded ? decoded.replaceAll("/", "\\") : null;
  }
  if (parsed.hostname !== "icon") return null;
  const decoded = safeDecode(parsed.pathname.replace(/^\/+/, ""));
  if (!decoded) return null;
  if (decoded.startsWith("/") || /^[A-Za-z]:[\\/]/.test(decoded)) return decoded;
  return `/${decoded}`;
}

export function withApplicationIcons(
  applications: InstalledApplication[],
  platform: string,
): InstalledApplication[] {
  return applications.map((application) => {
    const filePath = applicationIconFilePath(application.executablePath, platform);
    return { ...application, iconUrl: filePath ? applicationIconUrl(filePath) : null };
  });
}

export function installedApplicationIdentifier(application: InstalledApplication): string {
  return application.signingIdentifier
    || application.bundleIdentifier
    || application.packageFamilyName
    || application.publisherThumbprint
    || application.executablePath;
}

/** Display name, then the .app folder or executable stem. "Code" matches Visual Studio Code. */
export function applicationNameStems(executablePath: string): string[] {
  const stems: string[] = [];
  const appFolder = /([^/\\]+)\.app(?:[/\\]|$)/i.exec(executablePath);
  if (appFolder?.[1]) stems.push(appFolder[1]);
  const base = executablePath.split(/[/\\]/).pop() ?? "";
  const stem = base.replace(/\.exe$/i, "");
  if (stem && !/\.app$/i.test(base) && !stems.some((item) => item.toLocaleLowerCase() === stem.toLocaleLowerCase())) {
    stems.push(stem);
  }
  return stems;
}

export function applicationIconForLabel(
  key: string,
  label: string,
  applications: readonly InstalledApplication[],
  website = false,
): string | null {
  if (website || key.startsWith("web|")) return null;
  const needle = label.trim().toLocaleLowerCase();
  if (!needle) return null;
  const byName = applications.find((application) => application.displayName.trim().toLocaleLowerCase() === needle);
  if (byName) return byName.iconUrl ?? null;
  const byStem = applications.find((application) => (
    applicationNameStems(application.executablePath).some((stem) => stem.toLocaleLowerCase() === needle)
  ));
  return byStem?.iconUrl ?? null;
}

export function applicationIconForIdentifier(
  identifier: string,
  applications: readonly InstalledApplication[],
): string | null {
  const match = applications.find((application) => installedApplicationIdentifier(application) === identifier);
  return match?.iconUrl ?? null;
}

function inventoryIconPaths(applications: readonly InstalledApplication[]): Set<string> {
  const paths = new Set<string>();
  for (const application of applications) {
    if (!application.iconUrl) continue;
    const path = applicationIconPathFromUrl(application.iconUrl);
    if (path) paths.add(path);
  }
  return paths;
}

/** PNG response for an inventory icon. Paths outside the current inventory are refused. */
export async function applicationIconResponse(
  requestUrl: string,
  applications: readonly InstalledApplication[],
  readIcon: (filePath: string) => Promise<Uint8Array | null>,
  cache: Map<string, Uint8Array>,
): Promise<Response> {
  const filePath = applicationIconPathFromUrl(requestUrl);
  if (!filePath || !inventoryIconPaths(applications).has(filePath)) {
    return new Response(null, { status: 404 });
  }
  let body = cache.get(filePath);
  if (!body) {
    const read = await readIcon(filePath);
    if (!read) return new Response(null, { status: 404 });
    body = read;
    cache.set(filePath, body);
  }
  const bytes = new ArrayBuffer(body.byteLength);
  new Uint8Array(bytes).set(body);
  return new Response(bytes, {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=86400" },
  });
}
