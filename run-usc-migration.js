const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = 'postgresql://postgres:NSiqTuorpCpxCqieQwFATSeLTKbPsJym@yamabiko.proxy.rlwy.net:18420/railway';

async function runMigration() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false, // Railway requires SSL
    }
  });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected successfully\n');

    // Read migration file
    const migrationPath = path.join(__dirname, 'migrations', 'add-usc-card-verification.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📜 Running USC Card Verification migration...\n');
    console.log('Migration file:', migrationPath);
    console.log('SQL length:', migrationSQL.length, 'characters\n');

    // Execute migration
    await client.query(migrationSQL);

    console.log('✅ Migration completed successfully!\n');

    // Verify tables created
    console.log('🔍 Verifying tables...\n');

    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('usc_card_registrations', 'usc_scan_attempts')
      ORDER BY table_name
    `);

    console.log('Tables created:');
    tables.rows.forEach(row => {
      console.log('  ✅', row.table_name);
    });

    // Check user table columns
    const columns = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name IN ('usc_id', 'usc_verified_at', 'account_type', 'account_expires_at', 'expiry_warning_sent')
      ORDER BY column_name
    `);

    console.log('\nUser table columns added:');
    columns.rows.forEach(row => {
      console.log(`  ✅ ${row.column_name} (${row.data_type})`);
    });

    // Check indexes
    const indexes = await client.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE schemaname = 'public' 
      AND (
        indexname LIKE '%usc%' OR 
        indexname LIKE '%guest_expiry%'
      )
      ORDER BY indexname
    `);

    console.log('\nIndexes created:');
    indexes.rows.forEach(row => {
      console.log('  ✅', row.indexname);
    });

    console.log('\n🎉 USC Card Verification System Ready!');
    console.log('\nNext steps:');
    console.log('1. Set USC_ID_SALT environment variable');
    console.log('2. Deploy backend');
    console.log('3. Test with physical USC card');

  } catch (err) {
    console.error('\n❌ Migration failed:', err.message);
    console.error('\nFull error:', err);
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed');
  }
}

runMigration();

