require('dotenv').config();
const { query } = require('../config/db');

async function checkCols() {
  const res = await query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'users'
  `);
  console.log('USERS COLUMNS:', res.rows);
  process.exit();
}

checkCols();
