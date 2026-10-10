import { Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { AuthenticatedRequest } from '../../middleware/auth';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MAX_EXPORT_ROWS = 10_000;

function parsePositiveInt(value: unknown, fallback: number): number {
  const n = parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseDateBound(value: unknown): Date | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  // Accept YYYY-MM-DD (date input) or full ISO timestamps
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T00:00:00.000Z`)
    : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildWhere(
  search: string,
  action: string,
  startDate: Date | null,
  endDate: Date | null
): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};

  if (action) {
    where.action = action;
  }

  if (search) {
    where.OR = [
      { userName: { contains: search } },
      { action: { contains: search } },
      { details: { contains: search } },
      { ipAddress: { contains: search } },
    ];
  }

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) {
      where.createdAt.gte = startDate;
    }
    if (endDate) {
      // Inclusive end-of-day when only a calendar date was supplied
      const end = new Date(endDate);
      if (
        end.getUTCHours() === 0 &&
        end.getUTCMinutes() === 0 &&
        end.getUTCSeconds() === 0 &&
        end.getUTCMilliseconds() === 0
      ) {
        end.setUTCHours(23, 59, 59, 999);
      }
      where.createdAt.lte = end;
    }
  }

  return where;
}

function mapLog(l: {
  id: string;
  userId: string | null;
  userName: string | null;
  action: string;
  details: string | null;
  ipAddress: string | null;
  createdAt: Date;
}) {
  return {
    ...l,
    createdAt: l.createdAt.toISOString(),
  };
}

/**
 * Server-side paginated audit log listing.
 * Query: page, pageSize, search, action, startDate, endDate, export=true
 */
export async function getAuditLogs(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const search = String(req.query.search || '').trim();
    const action = String(req.query.action || '').trim();
    const startDate = parseDateBound(req.query.startDate);
    const endDate = parseDateBound(req.query.endDate);
    const exportAll = String(req.query.export || '') === 'true';

    if (startDate && endDate && startDate > endDate) {
      res.status(400).json({
        success: false,
        error: 'Start date must be on or before end date',
      });
      return;
    }

    const where = buildWhere(search, action, startDate, endDate);

    if (exportAll) {
      const [total, logs] = await Promise.all([
        prisma.auditLog.count({ where }),
        prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: MAX_EXPORT_ROWS,
        }),
      ]);

      res.json({
        success: true,
        data: {
          items: logs.map(mapLog),
          pagination: {
            page: 1,
            pageSize: logs.length,
            total,
            totalPages: 1,
          },
        },
      });
      return;
    }

    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      parsePositiveInt(req.query.pageSize, DEFAULT_PAGE_SIZE)
    );
    let page = parsePositiveInt(req.query.page, 1);

    const total = await prisma.auditLog.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    // Clamp page into a valid range for server-side pagination
    if (page > totalPages) page = totalPages;

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    res.json({
      success: true,
      data: {
        items: logs.map(mapLog),
        pagination: {
          page,
          pageSize,
          total,
          totalPages,
        },
      },
    });
  } catch (error) {
    console.error('getAuditLogs error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch audit logs' });
  }
}
