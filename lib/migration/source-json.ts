import { readFile } from "node:fs/promises";
import type { LegacyAppData } from "./types";

export async function readLegacyAppData(filePath: string): Promise<LegacyAppData> {
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as Partial<LegacyAppData>;
  if (!parsed.business || !Array.isArray(parsed.agents)) {
    throw new Error("avenlyo.json beklenen business/agents yapısında değil.");
  }
  return parsed as LegacyAppData;
}
