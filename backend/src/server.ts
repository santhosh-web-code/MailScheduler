import dotenv from 'dotenv';
dotenv.config();

import { createApp } from './app';
import { initElasticsearchIndex } from './modules/search/esClient';

const app = createApp();
const PORT = Number(process.env.PORT) || 5000;
const HOST = '0.0.0.0';

initElasticsearchIndex().catch((err) => {
  console.warn('[Server] Non-fatal Elasticsearch initialization notice:', err.message);
});

const server = app.listen(PORT, HOST, () => {
  console.log('========================================================');
  console.log(`🚀 ReachInbox Backend Express API Server Online`);
  console.log(`- Exact Host : ${HOST}`);
  console.log(`- Exact Port : ${PORT}`);
  console.log(`- Base URL   : http://localhost:${PORT}`);
  console.log(`- CORS Origin: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
  console.log(`- Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('========================================================');
});

export default server;
