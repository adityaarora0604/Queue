import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureRedisServerRunning } from './server/redis.ts';
import { getDb } from './server/db.ts';
import { initializeQueueAndWorker } from './server/queue.ts';
import { elasticsearch } from './server/elasticsearch.ts';
import { setupRoutes } from './server/routes.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // 1. Ensure Redis daemon is running
  ensureRedisServerRunning();

  // 2. Initialize Persistent SQLite Database
  await getDb();

  // 3. Initialize BullMQ Queue & Concurrency Worker
  await initializeQueueAndWorker();

  // 4. Initialize Elasticsearch Engine
  await elasticsearch.initialize();

  // 5. Mount API Routes & Bull Board
  const { router, bullBoardAdapter } = setupRoutes();
  app.use('/admin/queues', bullBoardAdapter.getRouter());
  app.use('/api', router);

  // 6. Vite Integration
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(`🚀 ReachInbox Email Scheduler backend running on port ${PORT}`);
    console.log(`📊 BullMQ Live Queue Dashboard: http://localhost:${PORT}/admin/queues`);
    console.log(`🔍 Elasticsearch API: http://localhost:${PORT}/api/es/emails/_search`);
    console.log(`=======================================================`);
  });
}

startServer().catch((err) => {
  console.error('Fatal error starting ReachInbox server:', err);
  process.exit(1);
});
