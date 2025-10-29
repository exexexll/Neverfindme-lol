const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const DATABASE_URL = 'postgresql://postgres:NSiqTuorpCpxCqieQwFATSeLTKbPsJym@yamabiko.proxy.rlwy.net:18420/railway';

async function wipeDatabase() {
  // Create readline interface for confirmation
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  // Ask for confirmation
  const answer = await new Promise((resolve) => {
    rl.question(
      '\n⚠️  WARNING: This will DELETE ALL DATA in the database!\n' +
      '   - All users\n' +
      '   - All sessions\n' +
      '   - All chat history\n' +
      '   - All USC card registrations\n' +
      '   - All invite codes\n' +
      '   - ALL DATA WILL BE PERMANENTLY DELETED\n\n' +
      'Type "WIPE DATABASE" to confirm (or anything else to cancel): ',
      (answer) => {
        rl.close();
        resolve(answer);
      }
    );
  });

  if (answer !== 'WIPE DATABASE') {
    console.log('\n❌ Database wipe cancelled');
    process.exit(0);
  }

  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false,
    }
  });

  try {
    console.log('\n🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected\n');

    // Read wipe script
    const wipePath = path.join(__dirname, 'wipe-database-fresh-start.sql');
    const wipeSQL = fs.readFileSync(wipePath, 'utf8');

    console.log('🗑️  Wiping database...\n');

    // Execute wipe
    const result = await client.query(wipeSQL);

    // Show verification results
    console.log('\n📊 Verification Results:');
    console.log('========================\n');
    
    if (result.rows && result.rows.length > 0) {
      result.rows.forEach(row => {
        const status = row.rows === 0 ? '✅' : '❌';
        console.log(`${status} ${row.table_name}: ${row.rows} rows`);
      });
    }

    console.log('\n🎉 DATABASE WIPED SUCCESSFULLY!\n');
    console.log('Next steps:');
    console.log('1. Server restart will start fresh');
    console.log('2. All users can re-register');
    console.log('3. USC cards freed for re-use');
    console.log('4. All QR codes reset\n');

  } catch (err) {
    console.error('\n❌ Database wipe failed:', err.message);
    console.error('\nFull error:', err);
    process.exit(1);
  } finally {
    await client.end();
    console.log('🔌 Disconnected\n');
  }
}

wipeDatabase();

