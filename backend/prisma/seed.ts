import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('[Seed] Seeding database with real environment configuration...');

  const fromEmail = process.env.SMTP_FROM_EMAIL || 'santhoshnanisanka@gmail.com';
  const fromName = process.env.SMTP_FROM_NAME || 'Santhosh';

  // 1. Ensure user exists for this identity
  const user = await prisma.user.upsert({
    where: { email: fromEmail },
    update: {
      name: fromName,
    },
    create: {
      googleId: `seed-user-${Date.now()}`,
      email: fromEmail,
      name: fromName,
      avatarUrl: null,
    },
  });

  console.log(`[Seed] User ready: ${user.name} <${user.email}> (ID: ${user.id})`);

  // 2. Remove any old/fake EmailSender rows that don't match the real fromAddress
  const deletedStale = await prisma.emailSender.deleteMany({
    where: {
      fromAddress: { not: fromEmail },
    },
  });
  if (deletedStale.count > 0) {
    console.log(`[Seed] Removed ${deletedStale.count} stale/fake EmailSender row(s).`);
  }

  // 3. Ensure exactly one real EmailSender row exists
  const existingSender = await prisma.emailSender.findFirst({
    where: { fromAddress: fromEmail },
  });

  const emailSender = existingSender
    ? await prisma.emailSender.update({
        where: { id: existingSender.id },
        data: {
          userId: user.id,
          fromAddress: fromEmail,
          fromName: fromName,
        },
      })
    : await prisma.emailSender.create({
        data: {
          userId: user.id,
          fromAddress: fromEmail,
          fromName: fromName,
        },
      });

  // 4. Remove any duplicate senders for fromEmail if any exist
  const removedDuplicates = await prisma.emailSender.deleteMany({
    where: {
      id: { not: emailSender.id },
    },
  });
  if (removedDuplicates.count > 0) {
    console.log(`[Seed] Removed ${removedDuplicates.count} duplicate EmailSender row(s).`);
  }

  console.log(
    `[Seed] Exactly one EmailSender ready: "${emailSender.fromName}" <${emailSender.fromAddress}> (ID: ${emailSender.id})`
  );
  console.log('[Seed] Database seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error('[Seed] Error during database seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
