import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function markPath() {
  const candidates = [
    process.resourcesPath ? join(process.resourcesPath, "freedom-mark.png") : "",
    join(process.cwd(), "src/renderer/src/assets/freedom-mark.png"),
    join(process.cwd(), "resources/freedom-mark.png"),
  ].filter(Boolean);
  return candidates.find((path) => existsSync(path)) ?? "";
}

function pageHtml() {
  const path = markPath();
  const image = path
    ? `<img alt="" src="data:image/png;base64,${readFileSync(path).toString("base64")}" />`
    : "";
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>You are free</title>
  <style>
    html, body { margin: 0; height: 100%; background: #3e648c; }
    body { display: flex; align-items: center; justify-content: center; }
    .mark, .words { display: flex; flex-direction: column; align-items: center; }
    .mark { gap: 36px; }
    .words { gap: 28px; }
    img { width: 132px; height: auto; }
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
      <p>You are free.<br />Do what matters.</p>
      <p class="name">Stop Scrolling</p>
    </div>
  </div>
</body>
</html>`;
}

let starting: Promise<string> | null = null;

/** Loopback page browsers can open in the blocked tab. */
export function freedomPageUrl(): Promise<string> {
  if (!starting) {
    starting = new Promise((resolve, reject) => {
      const server = createServer((_request, response) => {
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
