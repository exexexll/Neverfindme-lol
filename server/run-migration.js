// Run text chat migration
const fs = require('fs');
const path = require('path');
const { query } = require('./dist/database');

async function runMigration() {
  try {
    console.log('🔌 Using existing database connection...\n');
    
    // Read SQL file
    const sqlPath = path.join(__dirname, '..', 'migrations', 'add-text-chat-system.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('📄 Running migration: add-text-chat-system.sql\n');
    
    // Execute migration
    await query(sql);
    
    console.log('✅ Migration completed successfully!\n');
    
    // Verify
    console.log('🔍 Verifying tables...');
    const tables = await query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('chat_messages', 'chat_recordings', 'message_rate_limits')
      ORDER BY table_name
    `);
    
    console.log('Tables created:');
    tables.rows.forEach(row => console.log(`  ✓ ${row.table_name}`));
    
    console.log('\n🎉 Migration successful!\n');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();

