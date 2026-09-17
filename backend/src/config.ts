import 'dotenv/config';

export const config = {
  PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 8002,
  CPA_URL: process.env.CPA_URL || 'http://127.0.0.1:5201/v1',
  CPA_API_KEY: process.env.CPA_API_KEY || '',
  DB_PATH: process.env.DB_PATH || '/opt/shike-ai/data/db/shike.db',
  UPLOAD_DIR: process.env.UPLOAD_DIR || '/opt/shike-ai/data/uploads',
};

export default config;
