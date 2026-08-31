import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const wranglerPath = resolve("dist/server/wrangler.json");
const wrangler = JSON.parse(await readFile(wranglerPath, "utf8"));
const vars = wrangler.vars ?? {};
const forbidden = [
  ["APP_ENV", "development"],
  ["AUTH_DEV_CAPTURE", "true"],
  ["BETTER_AUTH_URL", "http://localhost:3000"],
];

const leaked = forbidden
  .filter(([key, value]) => vars[key] === value)
  .map(([key]) => key);

if (leaked.length > 0) {
  throw new Error(
    `Production artifact contains development-only runtime variables: ${leaked.join(", ")}`,
  );
}

console.log("Production artifact contains no development-only runtime variables.");
