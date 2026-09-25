import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import { config } from './config';
import authRouter from './modules/auth/auth.routes';
import slackRouter from './modules/slack/slack.routes';
import routes from './routes';
import { errorHandler, basicAuthMiddleware } from './middleware';
import { setupBullBoard } from './modules/queue/bullBoard';

export const createApp = () => {
  const app = express();

  const frontendUrl = process.env.FRONTEND_URL || config.frontendUrl || 'http://localhost:5173';

  app.use(
    cors({
      origin: [frontendUrl, 'http://localhost:5173', 'http://127.0.0.1:5173'],
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

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
