import { appendFile } from "node:fs/promises";
import path from "node:path";

const root = new URL(".", import.meta.url).pathname;
await appendFile(path.join(root, ".artifacts", "after.yml"), "\n# intentional tamper\n", "utf8");
