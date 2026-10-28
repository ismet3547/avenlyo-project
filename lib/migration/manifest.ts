import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  MigrationManifest,
  MigrationPhaseName,
  MigrationPhaseStatus,
} from "./types";

export async function readMigrationManifest(manifestPath: string) {
  const raw = await readFile(manifestPath, "utf8");
  const parsed = JSON.parse(raw) as MigrationManifest;
  if (parsed.version !== 1) {
    throw new Error(`Desteklenmeyen migration manifest sürümü: ${String(parsed.version)}`);
  }
  return parsed;
}

export async function writeMigrationManifest(
  manifestPath: string,
  manifest: MigrationManifest,
) {
  await mkdir(path.dirname(manifestPath), { recursive: true });
  const temp = `${manifestPath}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  await rename(temp, manifestPath);
}

export function resolveManifestPath(manifestPath: string, storedPath: string) {
  return path.resolve(path.dirname(manifestPath), storedPath);
}

export function relativeToManifest(manifestPath: string, absolutePath: string) {
  return path
    .relative(path.dirname(manifestPath), absolutePath)
    .split(path.sep)
    .join("/");
}

export async function setMigrationPhase(
  manifestPath: string,
  name: MigrationPhaseName,
  status: MigrationPhaseStatus,
  error?: string,
) {
  const manifest = await readMigrationManifest(manifestPath);
  const now = new Date().toISOString();
  manifest.phases = manifest.phases.map((phase) => {
    if (phase.name !== name) return phase;
    return {
      ...phase,
      status,
      ...(status === "running" && { startedAt: now, completedAt: undefined, error: undefined }),
      ...(status === "completed" && { completedAt: now, error: undefined }),
      ...(status === "failed" && { completedAt: now, error: error || "Migration phase failed." }),
    };
  });
  await writeMigrationManifest(manifestPath, manifest);
  return manifest;
}
