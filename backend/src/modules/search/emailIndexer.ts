import { esClient, EMAILS_INDEX } from './esClient';

export interface EmailSearchDoc {
  id: string;
  recipientEmail: string;
  subject: string;
  bodyHtml?: string;
  status: string;
  scheduledFor: string | Date;
  sentAt?: string | Date | null;
  senderId?: string | null;
  userId: string;
}

export function stripHtmlTags(html?: string): string {
  if (!html) return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function indexEmailJobAsync(doc: EmailSearchDoc): void {

  setImmediate(async () => {
    try {
      const scheduledForDate = doc.scheduledFor instanceof Date ? doc.scheduledFor.toISOString() : doc.scheduledFor;
      const sentAtDate = doc.sentAt instanceof Date ? doc.sentAt.toISOString() : doc.sentAt || null;

      await esClient.update({
        index: EMAILS_INDEX,
        id: doc.id,
        doc: {
          id: doc.id,
          recipientEmail: doc.recipientEmail,
          subject: doc.subject,
          ...(doc.bodyHtml !== undefined ? { bodyHtml: stripHtmlTags(doc.bodyHtml) } : {}),
          status: doc.status,
          scheduledFor: scheduledForDate,
          sentAt: sentAtDate,
          senderId: doc.senderId || null,
          userId: doc.userId,
        },
        doc_as_upsert: true,
      });
    } catch (error) {

      console.warn(`[Elasticsearch] Background indexing notice for Job ${doc.id}:`, (error as Error).message);
    }
  });
}

export function indexEmailJobsBulkAsync(docs: EmailSearchDoc[]): void {
  if (!docs || docs.length === 0) return;

  setImmediate(async () => {
    try {
      const CHUNK_SIZE = 250;
      for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
        const chunk = docs.slice(i, i + CHUNK_SIZE);
        const operations = chunk.flatMap((doc) => {
          const scheduledForDate =
            doc.scheduledFor instanceof Date ? doc.scheduledFor.toISOString() : doc.scheduledFor;
          const sentAtDate =
            doc.sentAt instanceof Date ? doc.sentAt.toISOString() : doc.sentAt || null;

          return [
            { update: { _index: EMAILS_INDEX, _id: doc.id } },
            {
              doc: {
                id: doc.id,
                recipientEmail: doc.recipientEmail,
                subject: doc.subject,
                ...(doc.bodyHtml !== undefined ? { bodyHtml: stripHtmlTags(doc.bodyHtml) } : {}),
                status: doc.status,
                scheduledFor: scheduledForDate,
                sentAt: sentAtDate,
                senderId: doc.senderId || null,
                userId: doc.userId,
              },
              doc_as_upsert: true,
            },
          ];
        });

        await esClient.bulk({ refresh: false, operations }).catch((err) => {
          console.warn('[Elasticsearch] Bulk indexing notice:', (err as Error).message);
        });
      }
    } catch (err) {
      console.warn('[Elasticsearch] Error in bulk indexing:', (err as Error).message);
    }
  });
}

export function deleteEmailJobAsync(id: string): void {
  setImmediate(async () => {
    try {
      await esClient.delete({
        index: EMAILS_INDEX,
        id,
      });
    } catch (error) {
      // Non-fatal if index or document does not exist
    }
  });
}

export function deleteEmailJobsBulkAsync(ids: string[]): void {
  if (!ids || ids.length === 0) return;

  setImmediate(async () => {
    try {
      const operations = ids.flatMap((id) => [{ delete: { _index: EMAILS_INDEX, _id: id } }]);
      await esClient.bulk({ refresh: false, operations }).catch(() => {});
    } catch (err) {
      // Non-fatal
    }
  });
}

