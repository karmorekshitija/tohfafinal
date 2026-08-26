require('dotenv').config();
const bcrypt = require('bcrypt');
const { query } = require('../config/db');

async function main() {
  try {
    const hash1 = await bcrypt.hash('Password@123', 10);
    const hash2 = await bcrypt.hash('password123', 10);
    const adminHash = await bcrypt.hash('AdminTohfa@2026', 10);

    const demoUsers = [
      { name: 'Rahul Buyer', email: 'buyer@thetohfa.in', role: 'buyer', hash: hash1 },
      { name: 'Rahul Buyer', email: 'buyer@tohfa.in', role: 'buyer', hash: hash2 },
      { name: 'Artisan Ananya', email: 'seller@thetohfa.in', role: 'seller', hash: hash1 },
      { name: 'Artisan Ananya', email: 'seller@tohfa.in', role: 'seller', hash: hash2 },
      { name: 'Tohfa Admin', email: 'admin@thetohfa.in', role: 'admin', hash: adminHash },
      { name: 'Tohfa Admin', email: 'admin@tohfa.in', role: 'admin', hash: adminHash },
    ];

    for (const u of demoUsers) {
      await query(`
        INSERT INTO users (full_name, display_name, email, password_hash, role, is_active, is_banned)
        VALUES ($1, $1, $2, $3, $4, 1, 0)
        ON CONFLICT (email) DO UPDATE 
        SET password_hash = EXCLUDED.password_hash, 
            is_active = 1, 
            is_banned = 0, 
            role = EXCLUDED.role,
            full_name = EXCLUDED.full_name
      `, [u.name, u.email, u.hash, u.role]);
      console.log(`Synced account: ${u.email} (${u.role})`);
    }

    console.log('\n=== ALL DEMO CREDENTIALS SUCCESSFULLY CREATED / SYNCED IN DATABASE! ===');
  } catch (err) {
    console.error('Error syncing users:', err.message);
  }
  process.exit();
}

main();
