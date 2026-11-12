import { migrate } from "@/db/migrate";

/** `npm run db:migrate` — works with no DATABASE_URL (embedded) and with one (Neon/Postgres). */
async function main() {
  const { driver, folder } = await migrate();
  console.log(`migrated: driver=${driver} store=${folder}`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error("migration failed:", err);
    process.exit(1);
  },
);
