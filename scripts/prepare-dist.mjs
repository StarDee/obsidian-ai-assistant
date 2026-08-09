// 将发布所需的静态文件复制到 dist/，与打包产物一起构成完整的 npm 包。
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const files = ["manifest.json", "styles.css", "versions.json"];

await mkdir(path.join(root, "dist"), { recursive: true });
for (const file of files) {
  await copyFile(path.join(root, file), path.join(root, "dist", file));
}
console.log(`已复制到 dist/: ${files.join(", ")}`);
