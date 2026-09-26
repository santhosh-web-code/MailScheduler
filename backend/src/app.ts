import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import { config, prisma } from './config';
import authRouter from './modules/auth/auth.routes';
import slackRouter from './modules/slack/slack.routes';
import routes from './routes';
import { errorHandler, basicAuthMiddleware } from './middleware';
import { setupBullBoard } from './modules/queue/bullBoard';
import { redisConnection } from './modules/queue/redisConnection';

export const createApp = () => {
  const app = express();

  const isProduction = process.env.NODE_ENV === 'production';
  const corsOrigin = isProduction
    ? (process.env.FRONTEND_URL
        ? (process.env.FRONTEND_URL.includes(',')
            ? process.env.FRONTEND_URL.split(',').map((u) => u.trim())
            : process.env.FRONTEND_URL.trim())
        : false)
    : [process.env.FRONTEND_URL || 'http://localhost:5173', 'http://localhost:5173', 'http://127.0.0.1:5173'];

  app.use(
    cors({
      origin: corsOrigin,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
        'Idempotency-Key',
        'x-idempotency-key',
      ],
    })
  );

  app.use(cookieParser());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use(passport.initialize());

  app.get('/health', async (_req, res) => {
    let dbStatus = 'ok';
    let redisStatus = 'ok';

    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (err) {
      dbStatus = 'fail';
      console.error('[HealthCheck] DB check failed:', (err as Error).message);
    }

    try {
      const pong = await redisConnection.ping();
      if (pong !== 'PONG') {
        redisStatus = 'fail';
      }
    } catch (err) {
      redisStatus = 'fail';
      console.error('[HealthCheck] Redis check failed:', (err as Error).message);
    }

    const isHealthy = dbStatus === 'ok' && redisStatus === 'ok';

    return res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'ok' : 'fail',
      db: dbStatus,
      redis: redisStatus,
      timestamp: new Date().toISOString(),
    });
  });

  const bullBoardAdapter = setupBullBoard();
  app.use('/admin/queues', basicAuthMiddleware, bullBoardAdapter.getRouter());

  app.use('/auth', authRouter);
  app.use('/auth', slackRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/auth', slackRouter);

  app.use('/api', routes);

  app.use(errorHandler);

  return app;
};

export default createApp;
