import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '.env');
dotenv.config({ path: envPath });

console.log("DB:", process.env.ODOO_DB);
console.log("USER:", process.env.ODOO_USER);
console.log("PASS:", process.env.ODOO_PASS);
