import { Pool } from 'pg';

const pool = new Pool({
    user: process.env.OLD_DB_USER ?? '',
    database: process.env.OLD_DB ?? '',
    password: process.env.OLD_DB_PASS ?? '',
    port: process.env.OLD_DB_PORT ? +process.env.OLD_DB_PORT : 5432,
    host: process.env.OLD_DB_HOST ?? 'localhost',
});

export default pool;
