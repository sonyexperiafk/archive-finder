import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config";

let sharedDb: DatabaseSync | null = null;

export function openDatabase(): DatabaseSync {
  fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });

  const db = new DatabaseSync(config.databasePath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

export function getDb(): DatabaseSync {
  if (!sharedDb) {
    sharedDb = openDatabase();
  }
  return sharedDb;
}

export function closeDatabase(): void {
  if (!sharedDb) {
    return;
  }

  sharedDb.close();
  sharedDb = null;
}
