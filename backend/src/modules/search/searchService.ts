import { esClient, EMAILS_INDEX } from './esClient';
import { prisma } from '../../config';

export interface SearchEmailParams {
  userId: string;
  query?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface SearchEmailResult {
  data: any[];
  total: number;
  source: 'elasticsearch' | 'database_fallback';
  page: number;
  limit: number;
  totalPages: number;
}

export async function searchEmails(params: SearchEmailParams): Promise<SearchEmailResult> {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(100, Math.max(1, params.limit || 20));
  const from = (page - 1) * limit;

  try {
    const must: any[] = [{ term: { userId: params.userId } }];

    if (params.query && params.query.trim()) {
      must.push({
        multi_match: {
          query: params.query.trim(),
          fields: ['recipientEmail^3', 'subject^2', 'bodyHtml'],
          fuzziness: 'AUTO',
          operator: 'or',
        },
      });
    }

    const filter: any[] = [];
    if (params.status && params.status.trim()) {
      const statuses = params.status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      if (statuses.length === 1) {
        filter.push({ term: { status: statuses[0] } });
      } else if (statuses.length > 1) {
        filter.push({ terms: { status: statuses } });
      }
    }

    const esResponse = await esClient.search({
      index: EMAILS_INDEX,
      from,
      size: limit,
      query: {
        bool: {
          must,
          filter,
        },
      },
      sort: [{ scheduledFor: { order: 'desc' } }],
    });

    const total =
      typeof esResponse.hits.total === 'number'
        ? esResponse.hits.total
        : esResponse.hits.total?.value || 0;

    const data = esResponse.hits.hits.map((hit) => ({
      ...(hit._source as any),
      _score: hit._score,
    }));

    return {
      data,
      total,
      source: 'elasticsearch',
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  } catch (error) {
    console.warn(
      '[SearchService] Elasticsearch query failed. Falling back gracefully to MySQL database:',
      (error as Error).message
    );

    const statuses = params.status
      ? params.status.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;

    const whereClause: any = {
      batch: { userId: params.userId },
      ...(statuses && statuses.length > 0 ? { status: { in: statuses } } : {}),
      ...(params.query && params.query.trim()
        ? {
            OR: [
              { subject: { contains: params.query.trim() } },
              { recipientEmail: { contains: params.query.trim() } },
            ],
          }
        : {}),
    };

    const [total, dbJobs] = await Promise.all([
      prisma.emailJob.count({ where: whereClause }),
      prisma.emailJob.findMany({
        where: whereClause,
        skip: from,
        take: limit,
        orderBy: { scheduledFor: 'desc' },
        include: {
          batch: {
            select: {
              subject: true,
              sender: {
                select: {
                  fromAddress: true,
                  fromName: true,
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      data: dbJobs,
      total,
      source: 'database_fallback',
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
