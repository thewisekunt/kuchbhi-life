const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10, 
  queueLimit: 0,
  
  // ZAROORI FIXES for Stability
  enableKeepAlive: true,      
  keepAliveInitialDelay: 10000, 
  connectTimeout: 20000,      
  
  ssl: {
    rejectUnauthorized: false 
  }
});

// Pool level error handling to prevent the entire bot from crashing
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