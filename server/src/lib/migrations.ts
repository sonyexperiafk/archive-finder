import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { config } from "../config";

const bundledMigrationsDir = path.resolve(fileURLToPath(new URL("../../migrations", import.meta.url)));
const migrationsDir = fs.existsSync(path.join(config.appRoot, "server", "migrations"))
  ? path.join(config.appRoot, "server", "migrations")
  : bundledMigrationsDir;

export function applyMigrations(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = db.prepare("SELECT name FROM migrations").all() as Array<{ name: string }>;
  const applied = new Set(appliedRows.map((row) => row.name));

  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((entry) => entry.endsWith(".sql"))
    .sort();

  const insert = db.prepare("INSERT INTO migrations (name, applied_at) VALUES (?, ?)");

  for (const migrationFile of migrationFiles) {
    if (applied.has(migrationFile)) {
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, migrationFile), "utf8");
    const now = new Date().toISOString();

    db.exec("BEGIN");
    try {
      db.exec(sql);
      insert.run(migrationFile, now);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}
