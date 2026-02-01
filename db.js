const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10, // Limit thoda badha diya hai concurrent queries ke liye
  queueLimit: 0,
  
  // 💡 ZAROORI FIXES:
  enableKeepAlive: true,      // Connection ko idle hone par marne nahi deta
  keepAliveInitialDelay: 10000, 
  connectTimeout: 20000,      // Remote DB ke liye zaroori hai agar ping high ho
  
  ssl: {
    rejectUnauthorized: false // Hostinger/Remote DBs ke liye 'false' zyada stable rehta hai agar CA certificate issues hon
  }
});

// Pool level error handling taaki bot crash na ho agar connection drop ho
pool.on('error', (err) => {
    console.error('❌ Unexpected Database Pool Error:', err.message);
    if (err.code === 'PROTOCOL_CONNECTION_LOST') {
        console.error('⚠️ Database connection was closed.');
    }
    if (err.code === 'ER_CON_COUNT_ERROR') {
        console.error('⚠️ Database has too many connections.');
    }
    if (err.code === 'ECONNREFUSED') {
        console.error('⚠️ Database connection was refused.');
    }
});

module.exports = pool;