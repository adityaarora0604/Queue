import React, { useState, useEffect } from 'react';
import { EmailRecord } from '../types';
import { Search, ExternalLink, CheckCircle2, XCircle, Mail } from 'lucide-react';

interface SentEmailsTableProps {
  emails: EmailRecord[];
  isLoading: boolean;
  onOpenCompose: () => void;
}

export const SentEmailsTable: React.FC<SentEmailsTableProps> = ({
  emails,
  isLoading,
  onOpenCompose,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredEmails, setFilteredEmails] = useState<EmailRecord[]>(emails);
  const [isSearching, setIsSearching] = useState(false);

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
          const matched: EmailRecord[] = data.hits.hits
            .map((h: any) => h._source)
            .filter((e: EmailRecord) => ['sent', 'failed'].includes(e.status));
          setFilteredEmails(matched);
        } else {
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

  const formatTimestamp = (ms: number | null): string => {
    if (!ms) return '-';
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
      {/* Search Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-lg border border-slate-800">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search sent emails via Elasticsearch (recipient, subject)..."
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
          <span>email{filteredEmails.length !== 1 ? 's' : ''} sent</span>
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
                <th className="py-3 px-4">Sent Time</th>
                <th className="py-3 px-4">Delivery Status</th>
                <th className="py-3 px-4 text-right">Ethereal Preview</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {isLoading && emails.length === 0 ? (
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
                      <div className="h-4 bg-slate-800 rounded w-24 ml-auto" />
                    </td>
                  </tr>
                ))
              ) : filteredEmails.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <div className="flex flex-col items-center justify-center max-w-sm mx-auto space-y-3">
                      <div className="w-10 h-10 rounded-full bg-slate-800/80 flex items-center justify-center text-slate-400">
                        <Mail className="w-5 h-5 text-indigo-400" />
                      </div>
                      <h3 className="text-sm font-semibold text-slate-200">No sent emails yet</h3>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Once BullMQ workers process scheduled jobs, delivered emails and their live Ethereal inbox previews will appear here.
                      </p>
                      <button
                        onClick={onOpenCompose}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors mt-2"
                      >
                        Compose First Email
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredEmails.map((email) => {
                  const isSuccess = email.status === 'sent';

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

                      {/* Sent Time */}
                      <td className="py-3 px-4 whitespace-nowrap font-mono tabular-nums text-slate-300">
                        {formatTimestamp(email.sent_at)}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {isSuccess ? (
                          <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Delivered</span>
                          </span>
                        ) : (
                          <div className="flex flex-col" title={email.last_error || 'SMTP Error'}>
                            <span className="inline-flex items-center gap-1.5 text-rose-400 font-medium">
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Failed</span>
                            </span>
                            <span className="text-[10px] text-rose-400/80 font-mono truncate max-w-[120px]">
                              {email.last_error || 'Error'}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Ethereal Preview Button */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {email.ethereal_preview_url ? (
                          <a
                            href={email.ethereal_preview_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-950/70 hover:bg-indigo-900 border border-indigo-800/60 text-indigo-300 hover:text-white rounded text-[11px] font-medium transition-colors"
                          >
                            <span>View in Ethereal</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-slate-500 font-mono text-[11px]">—</span>
                        )}
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
