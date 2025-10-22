// Run text chat migration on Railway PostgreSQL
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = 'postgresql://postgres:NSiqTuorpCpxCqieQwFATSeLTKbPsJym@yamabiko.proxy.rlwy.net:18420/railway';

async function runMigration() {
  const client = new Client({ connectionString });
  
  try {
    console.log('🔌 Connecting to Railway PostgreSQL...');
    await client.connect();
    console.log('✅ Connected successfully\n');
    
    // Read SQL file
    const sqlPath = path.join(__dirname, 'migrations', 'add-text-chat-system.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('📄 Running migration: add-text-chat-system.sql\n');
    
    // Execute migration
    const result = await client.query(sql);
    
    console.log('✅ Migration completed successfully!\n');
    
    // Verify tables created
    console.log('🔍 Verifying tables...');
    const tables = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('chat_messages', 'chat_recordings', 'message_rate_limits')
      ORDER BY table_name
    `);
    
    console.log('Tables created:');
    tables.rows.forEach(row => console.log(`  ✓ ${row.table_name}`));
    
    // Verify indexes
    console.log('\n🔍 Verifying indexes...');
    const indexes = await client.query(`
      SELECT indexname FROM pg_indexes 
      WHERE schemaname = 'public' 
      AND tablename IN ('chat_messages', 'chat_recordings', 'message_rate_limits')
      ORDER BY indexname
    `);
    
    console.log('Indexes created:');
    indexes.rows.forEach(row => console.log(`  ✓ ${row.indexname}`));
    
    // Verify functions
    console.log('\n🔍 Verifying functions...');
    const functions = await client.query(`
      SELECT routine_name FROM information_schema.routines 
      WHERE routine_schema = 'public' 
      AND routine_name IN ('delete_expired_recordings', 'cleanup_rate_limits')
      ORDER BY routine_name
    `);
    
    console.log('Functions created:');
    functions.rows.forEach(row => console.log(`  ✓ ${row.routine_name}()`));
    
    console.log('\n🎉 Migration verification complete! Database is ready for text+video chat system.\n');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    if (error.detail) console.error('Detail:', error.detail);
    process.exit(1);
  } finally {
    await client.end();
    console.log('🔌 Connection closed');
  }
}

runMigration();

