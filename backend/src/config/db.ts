import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient | undefined };

function getSanitizedDatabaseUrl(): string {
  let url = process.env.DATABASE_URL || '';
  if (!url) return url;

  // Enforce connection_limit=1 to keep Clever Cloud MySQL usage strictly within limits
  if (url.includes('connection_limit=')) {
    url = url.replace(/connection_limit=\d+/, 'connection_limit=1');
  } else {
    const separator = url.includes('?') ? '&' : '?';
    url = `${url}${separator}connection_limit=1`;
  }

  // Set 10s connect timeout if not provided
  if (!url.includes('connect_timeout=')) {
    url = `${url}&connect_timeout=10`;
  }

  return url;
}

let prismaInstance: PrismaClient;

if (globalForPrisma.prisma) {
  prismaInstance = globalForPrisma.prisma;
} else {
  const dbUrl = getSanitizedDatabaseUrl();
  prismaInstance = new PrismaClient({
    datasources: dbUrl ? { db: { url: dbUrl } } : undefined,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
  globalForPrisma.prisma = prismaInstance;
  console.log('[Prisma] Database client initialized with shared singleton (connection_limit=1 enforced).');
}

export const prisma = prismaInstance;
export default prisma;
