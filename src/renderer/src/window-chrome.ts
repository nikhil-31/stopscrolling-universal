export function installWindowChrome() {
  const ua = navigator.userAgent;
  const platform = /Mac/.test(ua) ? "macos" : /Win/.test(ua) ? "windows" : /Linux/.test(ua) ? "linux" : "unknown";
  document.documentElement.dataset.platform = platform;
}
