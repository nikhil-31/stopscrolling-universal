import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { ensureMacosDevApp } from "./macos-dev-app.mjs";

const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const command = args[0] === "preview" ? "preview" : "dev";
const rest = args[0] === "preview" ? args.slice(1) : args;

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

if (process.platform === "darwin") {
  env.ELECTRON_EXEC_PATH = ensureMacosDevApp();
}

const bin = join(dirname(require.resolve("electron-vite/package.json")), "bin", "electron-vite.js");
const child = spawn("node", [bin, command, ...rest], {
  stdio: "inherit",
  env,
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
