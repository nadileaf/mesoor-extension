import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json";

export default defineManifest({
  manifest_version: 3,
  name: pkg.name,
  version: pkg.version,
  icons: {
    48: "public/logo.png",
  },
  permissions: [
    "activeTab",
    "tabs",
    "scripting",
    "windows",
    "webRequest",
    "webNavigation",
    "sidePanel",
    "declarativeNetRequest",
    "downloads",
    "desktopCapture",
    "cookies",
    "storage",
  ],
  host_permissions: ["<all_urls>", "*://*.mesoor.com/*"],
  action: {
    default_icon: {
      48: "public/logo.png",
    },
    // default_popup: "src/popup/index.html", // 使用side panel
  },
  content_scripts: [
    {
      js: ["src/content/main.tsx"],
      matches: ["https://*/*"],
    },
  ],
  background: {
    service_worker: "src/background.js",
    type: "module",
  },
  side_panel: {
    default_path: "src/sidebar/index.html",
  },
});
