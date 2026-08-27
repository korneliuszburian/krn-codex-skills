import { cp, mkdir } from "node:fs/promises";
import path from "node:path";

const root = new URL(".", import.meta.url).pathname;
const dist = path.join(root, "dist");
await mkdir(dist, { recursive: true });
await cp(path.join(root, "index.html"), path.join(dist, "index.html"));
console.log("fixture build complete");
