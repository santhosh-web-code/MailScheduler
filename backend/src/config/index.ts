import { prisma } from './db';

export { prisma };
export * from './mailer';

export const config = {
  port: process.env.PORT || 5000,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  databaseUrl: process.env.DATABASE_URL || '',
  redis: {
    url: process.env.REDIS_URL || '',
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
  },
  elasticsearchUrl: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
  jwtSecret: process.env.JWT_SECRET || '',
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackUrl: process.env.GOOGLE_CALLBACK_URL || '',
  },
  ethereal: {
    user: process.env.ETHEREAL_USER || '',
    pass: process.env.ETHEREAL_PASS || '',
  },
  smtp: {
    provider: process.env.MAIL_PROVIDER || 'smtp',
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    fromName: process.env.SMTP_FROM_NAME || 'Santhosh',
    fromEmail: process.env.SMTP_FROM_EMAIL || 'santhoshnanisanka@gmail.com',
  },
  slack: {
    clientId: process.env.SLACK_CLIENT_ID || '',
    clientSecret: process.env.SLACK_CLIENT_SECRET || '',
    redirectUri: process.env.SLACK_REDIRECT_URI || '',
  },
  rateLimit: {
    maxEmailsPerHour: Number(process.env.MAX_EMAILS_PER_HOUR) || 50,
    minDelayBetweenEmailsMs: Number(process.env.MIN_DELAY_BETWEEN_EMAILS_MS) || 2000,
  },
  worker: {
    concurrency: Number(process.env.WORKER_CONCURRENCY) || 5,
  },
};
