// Standalone DB initialization script — run via: npm run db:init
import 'dotenv/config';
import { getDb, closeDb } from './database';

console.log('Initializing SafeTracks database...');
const db = getDb();

// Verify all tables created
const tables = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
).all() as { name: string }[];

console.log('Tables created:');
tables.forEach(t => console.log(`  ✓ ${t.name}`));
console.log('Database ready.');

closeDb();
