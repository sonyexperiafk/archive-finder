import { openDatabase } from "../src/db";
import { applyMigrations } from "../src/lib/migrations";

const db = openDatabase();
applyMigrations(db);
db.close();
console.log("Migrations applied.");
