import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Android shell around the exported static app (`out/`).
 *
 * The app itself has no server: content comes straight from public wikis
 * (their APIs answer with `Access-Control-Allow-Origin: *`) and is stored
 * in the WebView's IndexedDB.
 */
const config: CapacitorConfig = {
  appId: "com.walkthroughhub.app",
  appName: "WalkthroughHub",
  webDir: "out",
};

export default config;
