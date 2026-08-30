const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  const client = await pool.connect();
  try {
    console.log('Connecting to database...');
    
    // 1. Update users where profile_photo_url is NULL or empty or placeholder
    const resUsers = await client.query(`
      UPDATE users
      SET profile_photo_url = '/img/default-avatar.png'
      WHERE profile_photo_url IS NULL 
         OR profile_photo_url = '' 
         OR profile_photo_url LIKE '%placeholder%'
         OR profile_photo_url LIKE '%ui-avatars%'
    `);
    console.log(`Updated ${resUsers.rowCount} users with default avatar.`);

    // 2. Update seller_profiles where profile_photo or avatar_url is NULL or empty or placeholder
    const resSp = await client.query(`
      UPDATE seller_profiles
      SET profile_photo = '/img/default-avatar.png',
          avatar_url = '/img/default-avatar.png'
      WHERE profile_photo IS NULL 
         OR profile_photo = '' 
         OR profile_photo LIKE '%placeholder%'
         OR profile_photo LIKE '%ui-avatars%'
         OR avatar_url IS NULL
         OR avatar_url = ''
         OR avatar_url LIKE '%placeholder%'
         OR avatar_url LIKE '%ui-avatars%'
    `);
    console.log(`Updated ${resSp.rowCount} seller_profiles with default avatar.`);

    try {
      const resSellers = await client.query(`
        UPDATE sellers
        SET avatar_url = '/img/default-avatar.png'
        WHERE avatar_url IS NULL 
           OR avatar_url = '' 
           OR avatar_url LIKE '%placeholder%'
           OR avatar_url LIKE '%ui-avatars%'
      `);
      console.log(`Updated ${resSellers.rowCount} sellers with default avatar.`);
    } catch (e) {
      console.log('Sellers table note:', e.message);
    }

    console.log('Default avatar migration completed successfully.');
  } catch (err) {
    console.error('Error updating avatars:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
