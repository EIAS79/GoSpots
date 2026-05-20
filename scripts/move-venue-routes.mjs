import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "apps",
  "web",
  "src",
  "app",
  "(tenant)",
);
const dest = path.join(root, "dashboard", "[venuePath]");

const routes = [
  "menu",
  "subscription",
  "audit",
  "features",
  "losses",
  "reports",
  "invoices",
  "staff",
  "hours",
  "gallery",
  "settings",
  "sessions",
  "resources",
  "operations",
];

fs.mkdirSync(dest, { recursive: true });

for (const r of routes) {
  const srcPage = path.join(root, r, "page.tsx");
  if (!fs.existsSync(srcPage)) continue;
  const targetDir = path.join(dest, r);
  fs.mkdirSync(targetDir, { recursive: true });
  fs.renameSync(srcPage, path.join(targetDir, "page.tsx"));
  try {
    fs.rmdirSync(path.join(root, r));
  } catch {
    /* not empty */
  }
}

console.log("Moved routes into dashboard/[venuePath]/");
