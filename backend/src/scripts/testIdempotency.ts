import { prisma } from '../config';

async function main() {
  console.log('--- Testing Idempotency on POST /api/emails/schedule ---');

  const user = await prisma.user.findFirst();
  const sender = await prisma.emailSender.findFirst();

  if (!user || !sender) {
    console.error('Missing user or sender for test');
    process.exit(1);
  }

  const idempotencyKey = `test-idem-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const payload = {
    senderId: sender.id,
    subject: 'Idempotency Verification Test',
    bodyHtml: '<p>Testing network retry protection</p>',
    recipients: ['idem1@domain.com', 'idem2@domain.com'],
    startTime: new Date(Date.now() + 1000 * 3600 * 5).toISOString(),
    delayBetweenEmailsMs: 2000,
    hourlyLimit: 50,
    idempotencyKey,
  };

  const initialJobCount = await prisma.emailJob.count();
  const initialBatchCount = await prisma.emailBatch.count();

  console.log(`Sending First Request (Key: ${idempotencyKey})...`);
  const res1 = await fetch('http://localhost:5000/api/emails/schedule', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(payload),
  });

  const data1: any = await res1.json();
  console.log(`Response 1: Status = ${res1.status}, JobCount = ${data1.jobCount}, BatchId = ${data1.batch?.id}`);

  console.log(`Sending Second Request (Network Retry simulation)...`);
  const res2 = await fetch('http://localhost:5000/api/emails/schedule', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(payload),
  });

  const data2: any = await res2.json();
  const replayHeader = res2.headers.get('x-idempotent-replay');
  console.log(
    `Response 2: Status = ${res2.status}, ReplayHeader = ${replayHeader}, IdempotentReplayFlag = ${data2.idempotentReplay}, BatchId = ${data2.batch?.id}`
  );

  const finalJobCount = await prisma.emailJob.count();
  const finalBatchCount = await prisma.emailBatch.count();

  console.log('\n--- Verification Audit ---');
  console.log(`Batches created: ${finalBatchCount - initialBatchCount} (Expected: 1)`);
  console.log(`EmailJobs created: ${finalJobCount - initialJobCount} (Expected: 2)`);
  console.log(`Matching batch ID: ${data1.batch?.id === data2.batch?.id}`);

  if (
    finalBatchCount - initialBatchCount === 1 &&
    finalJobCount - initialJobCount === 2 &&
    data1.batch?.id === data2.batch?.id &&
    replayHeader === 'true'
  ) {
    console.log('✅ IDEMPOTENCY AUDIT PASSED: Zero duplicates created on retry!');
  } else {
    console.error('❌ IDEMPOTENCY AUDIT FAILED!');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
