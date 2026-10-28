import { migrateToLatest } from "@/lib/db/migrate";
import { destroyPostgresPools } from "@/lib/db/pool";

try {
  const results = await migrateToLatest();
  for (const result of results) {
    console.log(`${result.migrationName}: ${result.status}`);
  }
} finally {
  await destroyPostgresPools();
}
