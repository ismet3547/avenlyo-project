import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { sha256File } from "./hash";
import type { UploadFileInventory } from "./types";

async function walk(root: string, current = root): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(current, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(root, fullPath)));
    else if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

export async function inventoryUploadFiles(root: string): Promise<UploadFileInventory[]> {
  const files = (await walk(root)).sort();
  return await Promise.all(
    files.map(async (filePath) => {
      const info = await stat(filePath);
      return {
        path: path.relative(root, filePath).split(path.sep).join("/"),
        sizeBytes: info.size,
        sha256: await sha256File(filePath),
      };
    }),
  );
}

export function uploadFileForDocument(
  files: UploadFileInventory[],
  documentId: string,
) {
  const matches = files.filter(
    (file) => file.path === documentId || file.path.startsWith(`${documentId}/`),
  );
  if (matches.length !== 1) {
    throw new Error(
      `Document ${documentId} için tam bir upload bekleniyordu, bulunan: ${matches.length}`,
    );
  }
  return matches[0];
}
