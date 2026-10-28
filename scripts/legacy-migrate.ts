const command = process.argv[2] || "status";
const allowed = new Set(["plan", "dry-run", "apply", "verify", "status", "rollback"]);
if (!allowed.has(command)) {
  console.error("Kullanım: npm run legacy:migrate -- plan|dry-run|apply|verify|status|rollback");
  process.exitCode = 2;
} else {
  console.log(`legacy:migrate ${command}: migration harness bir sonraki committe etkinleştirilecek.`);
}
