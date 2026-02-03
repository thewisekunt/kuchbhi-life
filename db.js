const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,

  // Pool behavior
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,

  // Stability / performance
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  connectTimeout: 20000,

  // Timezone consistency (VERY important)
  timezone: 'Z',

  // SSL (safe for Railway, PlanetScale, etc.)
  ssl: process.env.DB_SSL === 'true'
    ? { rejectUnauthorized: false }
    : undefined
});

/**
 * ⚠️ IMPORTANT:
 * mysql2 pools do NOT emit `error` events like node-mysql.
 * Errors must be caught at query / connection level.
 *
 * The only safe global check is an initial connection test.
 */

// Initial connectivity test (non-fatal)
(async () => {
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    console.log('✅ Database pool initialized');
  } catch (err) {
    console.error('❌ Database connection failed at startup:', err.message);
  }
})();

module.exports = pool;
