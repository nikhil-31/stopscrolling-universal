import { createServer, type ServerResponse } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { BUILTIN_DETAIL, BUILTIN_HEADER, blockScreenPresetPath } from "./block-screens";

export interface FreedomContent {
  header: string;
  detail: string;
  imagePath: string;
}

const IMAGE_NAME = /^[\w-]+\.(png|jpg|jpeg|gif|webp)$/;

let mediaRoot = "";
let content: FreedomContent = {
  header: BUILTIN_HEADER,
  detail: BUILTIN_DETAIL,
  imagePath: "",
};

export function setBlockScreenMediaRoot(dir: string) {
  mediaRoot = dir;
}

export function setFreedomContent(next: FreedomContent) {
  content = {
    header: next.header.trim() || BUILTIN_HEADER,
    detail: next.detail.trim() || BUILTIN_DETAIL,
    imagePath: next.imagePath,
  };
}

export function freedomContent() {
  return content;
}

function markPath() {
  const candidates = [
    process.resourcesPath ? join(process.resourcesPath, "freedom-mark.png") : "",
    join(process.cwd(), "src/renderer/src/assets/freedom-mark.png"),
    join(process.cwd(), "resources/freedom-mark.png"),
  ].filter(Boolean);
  return candidates.find((path) => existsSync(path)) ?? "";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function contentType(path: string) {
  const ext = extname(path).toLowerCase();
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return "image/png";
}

function namedMediaPath(name: string) {
  let decoded = name;
  try {
    decoded = decodeURIComponent(name);
  } catch {
    return "";
  }
  if (!mediaRoot || !IMAGE_NAME.test(decoded)) return "";
  const path = join(mediaRoot, "images", decoded);
  return existsSync(path) ? path : "";
}

function pageHtml() {
  const customImage = Boolean(content.imagePath && existsSync(content.imagePath));
  const path = customImage ? "" : markPath();
  const image = customImage
    ? `<img class="custom" alt="" src="/media" />`
    : path
      ? `<img alt="" src="data:image/png;base64,${readFileSync(path).toString("base64")}" />`
      : "";
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(content.header)}</title>
  <style>
    html, body { margin: 0; height: 100%; background: #3e648c; }
    body { display: flex; align-items: center; justify-content: center; }
    .mark, .words { display: flex; flex-direction: column; align-items: center; }
    .mark { gap: 36px; }
    .words { gap: 28px; }
    img { width: 132px; height: auto; }
    img.custom { width: auto; max-width: min(420px, 70vw); max-height: 40vh; }
    p, .name {
      margin: 0;
      color: #eff9ee;
      font-family: "New York", "Iowan Old Style", Palatino, "Palatino Linotype", Georgia, serif;
      text-align: center;
    }
    p {
      font-size: 36px;
      font-weight: 500;
      letter-spacing: -0.015em;
      line-height: 1.28;
    }
    .name { font-size: 18px; font-weight: 500; letter-spacing: 0.04em; }
  </style>
</head>
<body>
  <div class="mark">
    ${image}
    <div class="words">
      <p>${escapeHtml(content.header)}<br />${escapeHtml(content.detail)}</p>
      <p class="name">Stop Scrolling</p>
    </div>
  </div>
  <script>
    history.pushState(null, "", location.href);
    addEventListener("popstate", function () {
      history.pushState(null, "", location.href);
    });
  </script>
</body>
</html>`;
}

function serveFile(response: ServerResponse, path: string) {
  if (!path || !existsSync(path)) {
    response.writeHead(404);
    response.end();
    return;
  }
  response.writeHead(200, {
    "content-type": contentType(path),
    "cache-control": "no-store",
  });
  response.end(readFileSync(path));
}

let starting: Promise<string> | null = null;

/** Loopback page browsers can open in the blocked tab. */
export function freedomPageUrl(): Promise<string> {
  if (!starting) {
    starting = new Promise((resolve, reject) => {
      const server = createServer((request, response) => {
        const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
        if (requestUrl.pathname === "/media") {
          serveFile(response, content.imagePath);
          return;
        }
        if (requestUrl.pathname.startsWith("/media/")) {
          serveFile(response, namedMediaPath(requestUrl.pathname.slice("/media/".length)));
          return;
        }
        if (requestUrl.pathname.startsWith("/presets/")) {
          let name = requestUrl.pathname.slice("/presets/".length);
          try {
            name = decodeURIComponent(name);
          } catch {
            name = "";
          }
          serveFile(response, blockScreenPresetPath(name));
          return;
        }
        response.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        });
        response.end(pageHtml());
      });
      server.once("error", (error) => {
        starting = null;
        reject(error);
      });
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (!address || typeof address === "string") {
          starting = null;
          reject(new Error("Freedom page did not bind a port."));
          return;
        }
        resolve(`http://127.0.0.1:${address.port}/`);
      });
    });
  }
  return starting;
}
