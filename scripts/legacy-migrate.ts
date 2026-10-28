import path from "node:path";
import { planLegacyMigration } from "@/lib/migration/planner";
import {
  applyLegacyMigration,
  dryRunLegacyMigration,
  rollbackLegacyMigration,
} from "@/lib/migration/importer";
import {
  readMigrationManifest,
} from "@/lib/migration/manifest";
import {
  verifyAndCheckpoint,
  verifyLegacySource,
  verifyLegacyTarget,
} from "@/lib/migration/verifier";

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const command = process.argv[2] || "status";
  const manifestPath = path.resolve(
    option("--manifest") || "./migration/legacy-manifest.json",
  );

  if (command === "plan") {
    const sourceDir = path.resolve(option("--source") || "./data");
    const manifest = await planLegacyMigration({
      sourceDir,
      manifestPath,
      workspaceSlug: option("--workspace-slug"),
      storageRoot: option("--storage-root"),
    });
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }

  if (command === "dry-run") {
    const source = await verifyLegacySource(manifestPath);
    if (!source.ok) throw new Error(source.errors.join("\n"));
    await dryRunLegacyMigration(manifestPath);
    console.log("Dry-run başarılı; PostgreSQL transaction rollback edildi.");
    return;
  }

  if (command === "apply") {
    await applyLegacyMigration(manifestPath, {
      resume: process.argv.includes("--resume"),
    });
    console.log("Legacy DB fazları ve dosya kopyası tamamlandı.");
    return;
  }

  if (command === "verify") {
    const report = await verifyAndCheckpoint(manifestPath);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (command === "status") {
    const manifest = await readMigrationManifest(manifestPath);
    console.log(JSON.stringify(manifest.phases, null, 2));
    return;
  }

  if (command === "rollback") {
    await rollbackLegacyMigration(manifestPath);
    console.log("Legacy target workspace ve workspace dosyaları kaldırıldı.");
    return;
  }

  if (command === "verify-source") {
    console.log(JSON.stringify(await verifyLegacySource(manifestPath), null, 2));
    return;
  }

  if (command === "verify-target") {
    console.log(JSON.stringify(await verifyLegacyTarget(manifestPath), null, 2));
    return;
  }

  throw new Error(
    "Kullanım: npm run legacy:migrate -- plan|dry-run|apply|verify|status|rollback",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
