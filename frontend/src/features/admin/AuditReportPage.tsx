import React, { useCallback, useEffect, useState } from 'react';
import api from '../../api/client';
import { AuditAction, AuditLogDto } from '@rdp/shared';
import { Search, Download, ChevronLeft, ChevronRight, FileSpreadsheet, Loader2, CalendarRange } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
const ACTION_OPTIONS = Object.values(AuditAction);

function isValidDateRange(start: string, end: string): boolean {
  if (!start || !end) return true;
  return start <= end;
}

/** Convert YYYY-MM-DD to local start-of-day ISO (inclusive). */
function toStartOfDayIso(dateStr: string): string | undefined {
  if (!dateStr) return undefined;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
}

/** Convert YYYY-MM-DD to local end-of-day ISO (inclusive). */
function toEndOfDayIso(dateStr: string): string | undefined {
  if (!dateStr) return undefined;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
}

function actionBadgeVariant(action: string): 'destructive' | 'default' | 'secondary' | 'outline' {
  if (action.includes('FAILURE')) return 'destructive';
  if (action.includes('CONNECT')) return 'default';
  if (action.includes('CREATE')) return 'secondary';
  return 'outline';
}

export const AuditReportPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogDto[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // Server-side fetch: only the current page is loaded from the API
  const fetchLogs = useCallback(async () => {
    if (!isValidDateRange(startDate, endDate)) {
      setLogs([]);
      setTotal(0);
      setTotalPages(1);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const res = await api.get('/audit-logs', {
        params: {
          page,
          pageSize,
          search: search || undefined,
          action: actionFilter !== 'ALL' ? actionFilter : undefined,
          startDate: toStartOfDayIso(startDate),
          endDate: toEndOfDayIso(endDate),
        },
      });

      if (res.data.success) {
        const { items, pagination } = res.data.data;
        setLogs(items);
        setTotal(pagination.total);
        setTotalPages(pagination.totalPages);
        // Sync page if server clamped it (e.g. filters reduced result set)
        if (pagination.page !== page) {
          setPage(pagination.page);
        }
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load audit logs');
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, search, actionFilter, startDate, endDate]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Debounced search — commit term and reset to page 1 in the same update batch
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = searchInput.trim();
      if (next === search) return;
      setSearch(next);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput, search]);

  const handleActionFilterChange = (value: string) => {
    setActionFilter(value);
    setPage(1);
  };

  const handlePageSizeChange = (value: string) => {
    setPageSize(Number(value));
    setPage(1);
  };

  const handleStartDateChange = (value: string) => {
    setStartDate(value);
    setPage(1);
  };

  const handleEndDateChange = (value: string) => {
    setEndDate(value);
    setPage(1);
  };

  const handleClearDateRange = () => {
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const handleExportExcel = async () => {
    if (!isValidDateRange(startDate, endDate)) {
      toast.error('Start date must be on or before end date');
      return;
    }

    setIsExporting(true);
    try {
      const res = await api.get('/audit-logs', {
        params: {
          export: 'true',
          search: search || undefined,
          action: actionFilter !== 'ALL' ? actionFilter : undefined,
          startDate: toStartOfDayIso(startDate),
          endDate: toEndOfDayIso(endDate),
        },
      });

      if (!res.data.success) {
        throw new Error(res.data.error || 'Export failed');
      }

      const items: AuditLogDto[] = res.data.data.items || [];
      const rows = items.map((log) => ({
        Timestamp: new Date(log.createdAt).toLocaleString(),
        User: log.userName || 'System / Guest',
        Action: log.action,
        Details: log.details || '',
        'IP Address': log.ipAddress || '',
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      worksheet['!cols'] = [
        { wch: 22 },
        { wch: 24 },
        { wch: 18 },
        { wch: 50 },
        { wch: 16 },
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Audit Report');

      const rangeSuffix =
        startDate || endDate
          ? `_${startDate || 'start'}_to_${endDate || 'end'}`
          : '';
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      XLSX.writeFile(workbook, `audit-report${rangeSuffix}-${stamp}.xlsx`);
      toast.success(`Exported ${items.length} audit event${items.length === 1 ? '' : 's'}`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to export audit report');
    } finally {
      setIsExporting(false);
    }
  };

  const dateRangeInvalid = !isValidDateRange(startDate, endDate);
  const hasDateFilter = Boolean(startDate || endDate);

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="space-y-6">
      <div className="border-b pb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit Report</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Full history of authentication events, admin actions, and VM connection attempts
          </p>
        </div>
        <Button onClick={handleExportExcel} disabled={isExporting || total === 0 || dateRangeInvalid}>
          {isExporting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          Export to Excel
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Audit History
          </CardTitle>
          <CardDescription>
            Server-side search, date range, filter, and pagination across the complete audit trail
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
            <div className="relative flex-1 min-w-[200px]">
              <Label htmlFor="audit-search" className="sr-only">
                Search
              </Label>
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="audit-search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search user, action, details, or IP..."
                className="pl-9"
              />
            </div>

            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="audit-start-date" className="text-xs text-muted-foreground flex items-center gap-1">
                  <CalendarRange className="h-3.5 w-3.5" />
                  Start date
                </Label>
                <Input
                  id="audit-start-date"
                  type="date"
                  value={startDate}
                  max={endDate || undefined}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                  className="w-full sm:w-[160px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="audit-end-date" className="text-xs text-muted-foreground">
                  End date
                </Label>
                <Input
                  id="audit-end-date"
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(e) => handleEndDateChange(e.target.value)}
                  className="w-full sm:w-[160px]"
                />
              </div>
              {hasDateFilter && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="self-end"
                  onClick={handleClearDateRange}
                >
                  Clear dates
                </Button>
              )}
            </div>

            <Select value={actionFilter} onValueChange={handleActionFilterChange}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Filter by action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All actions</SelectItem>
                {ACTION_OPTIONS.map((action) => (
                  <SelectItem key={action} value={action}>
                    {action}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
              <SelectTrigger className="w-full sm:w-[140px]">
                <SelectValue placeholder="Page size" />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size} / page
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {dateRangeInvalid && (
            <p className="text-sm text-destructive">Start date must be on or before end date.</p>
          )}

          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading audit history...</div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No audit events match your filters.</div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>IP Address</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="font-medium">{log.userName || 'System / Guest'}</TableCell>
                      <TableCell>
                        <Badge variant={actionBadgeVariant(log.action)}>{log.action}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-md truncate">
                        {log.details || '-'}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {log.ipAddress || '127.0.0.1'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-2">
            <p className="text-sm text-muted-foreground">
              {total === 0 ? 'No results' : `Showing ${from}–${to} of ${total}`}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || isLoading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <span className="text-sm text-muted-foreground tabular-nums px-2">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || isLoading}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
