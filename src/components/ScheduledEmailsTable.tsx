import React, { useState, useEffect } from 'react';
import { EmailRecord } from '../types';
import { Search, Clock, Play, Trash2, Calendar, AlertTriangle, ArrowUpDown } from 'lucide-react';

interface ScheduledEmailsTableProps {
  emails: EmailRecord[];
  isLoading: boolean;
  onRefresh: () => void;
  onOpenCompose: () => void;
}

export const ScheduledEmailsTable: React.FC<ScheduledEmailsTableProps> = ({
  emails,
  isLoading,
  onRefresh,
  onOpenCompose,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredEmails, setFilteredEmails] = useState<EmailRecord[]>(emails);
  const [isSearching, setIsSearching] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Live countdown timer state update every 1 second
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Search logic with Elasticsearch query endpoint
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredEmails(emails);
      return;
    }

    const handler = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}&status=all`);
        const data = await res.json();
        if (data.hits && data.hits.hits) {
          const matchedEmails: EmailRecord[] = data.hits.hits
            .map((h: any) => h._source)
            .filter((e: EmailRecord) => ['scheduled', 'rescheduled', 'sending'].includes(e.status));
          setFilteredEmails(matchedEmails);
        } else {
          // Client-side fallback filter
          const q = searchQuery.toLowerCase();
          setFilteredEmails(
            emails.filter(
              (e) =>
                e.recipient.toLowerCase().includes(q) ||
                e.subject.toLowerCase().includes(q) ||
                e.sender.toLowerCase().includes(q)
            )
          );
        }
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => clearTimeout(handler);
  }, [searchQuery, emails]);

  const handleSendNow = async (emailId: string) => {
    setActionLoadingId(emailId);
    try {
      const res = await fetch(`/api/emails/${emailId}/send-now`, { method: 'POST' });
      if (res.ok) {
        onRefresh();
      }
    } catch (err) {
      console.error('Send now error:', err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCancel = async (emailId: string) => {
    if (!confirm('Are you sure you want to cancel this scheduled email?')) return;
    setActionLoadingId(emailId);
    try {
      const res = await fetch(`/api/emails/${emailId}/cancel`, { method: 'POST' });
      if (res.ok) {
        onRefresh();
      }
    } catch (err) {
      console.error('Cancel error:', err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const formatCountdown = (targetTime: number): string => {
    const diff = targetTime - Date.now();
    if (diff <= 0) return 'Executing now...';
    const totalSecs = Math.floor(diff / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    if (mins > 60) {
      const hours = Math.floor(mins / 60);
      const remMins = mins % 60;
      return `in ${hours}h ${remMins}m`;
    }
    if (mins > 0) return `in ${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
    return `in ${secs}s`;
  };

  const formatTimestamp = (ms: number): string => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(new Date(ms));
  };

  return (
    <div className="space-y-4">
      {/* Top Controls: Search & Refresh */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-lg border border-slate-800">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search scheduled emails via Elasticsearch (recipient, subject)..."
            className="w-full bg-slate-950 border border-slate-800 rounded-md pl-9 pr-8 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
          {isSearching && (
            <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
          )}
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto text-xs text-slate-400">
          <span className="font-mono tabular-nums text-slate-300 font-medium">
            {filteredEmails.length}
          </span>
          <span>email{filteredEmails.length !== 1 ? 's' : ''} in queue</span>
        </div>
      </div>

      {/* Table Card */}
      <div className="border border-slate-800 rounded-lg bg-slate-900/40 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/80 text-slate-400 font-medium">
                <th className="py-3 px-4">Recipient</th>
                <th className="py-3 px-4">Subject</th>
                <th className="py-3 px-4">Sender</th>
                <th className="py-3 px-4">Scheduled Execution</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {isLoading && emails.length === 0 ? (
                // Skeleton loading rows
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="py-3 px-4">
                      <div className="h-4 bg-slate-800 rounded w-36" />
                    </td>
                    <td className="py-3 px-4">
                      <div className="h-4 bg-slate-800 rounded w-52" />
                    </td>
                    <td className="py-3 px-4">
                      <div className="h-4 bg-slate-800 rounded w-28" />
                    </td>
                    <td className="py-3 px-4">
                      <div className="h-4 bg-slate-800 rounded w-32" />
                    </td>
                    <td className="py-3 px-4">
                      <div className="h-4 bg-slate-800 rounded w-20" />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="h-4 bg-slate-800 rounded w-16 ml-auto" />
                    </td>
                  </tr>
                ))
              ) : filteredEmails.length === 0 ? (
                // Empty state
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <div className="flex flex-col items-center justify-center max-w-sm mx-auto space-y-3">
                      <div className="w-10 h-10 rounded-full bg-slate-800/80 flex items-center justify-center text-slate-400">
                        <Calendar className="w-5 h-5 text-indigo-400" />
                      </div>
                      <h3 className="text-sm font-semibold text-slate-200">No scheduled emails pending</h3>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Schedule an email campaign with custom delays and rate limits, or use the quick sample filler.
                      </p>
                      <button
                        onClick={onOpenCompose}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors mt-2"
                      >
                        Compose New Email
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredEmails.map((email) => {
                  const isActionLoading = actionLoadingId === email.id;
                  const isRescheduled = email.status === 'rescheduled';
                  const isSending = email.status === 'sending';

                  return (
                    <tr
                      key={email.id}
                      className="hover:bg-slate-800/40 transition-colors group text-slate-300"
                    >
                      {/* Recipient */}
                      <td className="py-3 px-4 font-mono text-[11px] font-medium text-slate-200">
                        {email.recipient}
                      </td>

                      {/* Subject */}
                      <td className="py-3 px-4 max-w-xs">
                        <span className="truncate block font-medium text-slate-200" title={email.subject}>
                          {email.subject}
                        </span>
                      </td>

                      {/* Sender */}
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-400 truncate max-w-[150px]" title={email.sender}>
                        {email.sender.split('@')[0]}
                      </td>

                      {/* Scheduled Time + Countdown */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="font-mono tabular-nums text-slate-200">
                            {formatTimestamp(email.scheduled_at)}
                          </span>
                          <span className="text-[10px] text-indigo-400 font-mono font-medium flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            {formatCountdown(email.scheduled_at)}
                          </span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {isSending ? (
                          <span className="inline-flex items-center gap-1.5 text-blue-400 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                            <span>Sending</span>
                          </span>
                        ) : isRescheduled ? (
                          <div className="flex flex-col" title={email.last_error || 'Delayed due to rate limit'}>
                            <span className="inline-flex items-center gap-1 text-amber-400 font-medium">
                              <AlertTriangle className="w-3 h-3" />
                              <span>Rescheduled</span>
                            </span>
                            <span className="text-[10px] text-amber-500/80 font-mono">
                              Limit postponed
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-indigo-400 font-medium">
                            <Clock className="w-3 h-3" />
                            <span>Scheduled</span>
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleSendNow(email.id)}
                            disabled={isActionLoading || isSending}
                            title="Send Immediately (Promote BullMQ delayed job)"
                            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 hover:text-white rounded text-[11px] font-medium flex items-center gap-1 transition-colors"
                          >
                            <Play className="w-3 h-3 text-emerald-400" />
                            <span>Send Now</span>
                          </button>

                          <button
                            onClick={() => handleCancel(email.id)}
                            disabled={isActionLoading || isSending}
                            title="Cancel Job"
                            className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
