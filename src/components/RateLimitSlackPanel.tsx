import React, { useState } from 'react';
import { RateLimitEvent, SenderRecord, SlackConfig } from '../types';
import {
  ShieldAlert,
  Send,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Bell,
  Link as LinkIcon,
  HelpCircle,
} from 'lucide-react';

interface RateLimitSlackPanelProps {
  senders: SenderRecord[];
  events: RateLimitEvent[];
  slackConfig: SlackConfig | null;
  onRefresh: () => void;
}

export const RateLimitSlackPanel: React.FC<RateLimitSlackPanelProps> = ({
  senders,
  events,
  slackConfig,
  onRefresh,
}) => {
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [editingLimit, setEditingLimit] = useState<number>(20);

  // Slack state
  const [webhookUrl, setWebhookUrl] = useState<string>(slackConfig?.webhook_url || '');
  const [channelName, setChannelName] = useState<string>(slackConfig?.channel_name || '#email-rate-limit-alerts');
  const [isSavingSlack, setIsSavingSlack] = useState(false);
  const [isTestingSlack, setIsTestingSlack] = useState(false);
  const [slackMessage, setSlackMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  const handleSaveSenderLimit = async (senderEmail: string) => {
    try {
      const res = await fetch(`/api/senders/${encodeURIComponent(senderEmail)}/limit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: editingLimit }),
      });
      if (res.ok) {
        setEditingEmail(null);
        onRefresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleResetSenderWindow = async (senderEmail: string) => {
    try {
      await fetch('/api/rate-limits/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: senderEmail }),
      });
      onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveSlack = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSlack(true);
    setSlackMessage(null);
    try {
      const res = await fetch('/api/slack/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhook_url: webhookUrl.trim(),
          channel_name: channelName.trim(),
          enabled: true,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSlackMessage({ text: 'Slack configuration saved successfully!' });
        onRefresh();
      } else {
        setSlackMessage({ text: data.error || 'Failed to save', isError: true });
      }
    } catch (err: any) {
      setSlackMessage({ text: err.message, isError: true });
    } finally {
      setIsSavingSlack(false);
    }
  };

  const handleTestSlack = async () => {
    setIsTestingSlack(true);
    setSlackMessage(null);
    try {
      const res = await fetch('/api/slack/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhook_url: webhookUrl.trim() }),
      });
      const data = await res.json();
      setSlackMessage({ text: data.message, isError: !data.success });
      onRefresh();
    } catch (err: any) {
      setSlackMessage({ text: `Test error: ${err.message}`, isError: true });
    } finally {
      setIsTestingSlack(false);
    }
  };

  const handleDisconnectSlack = async () => {
    if (!confirm('Disconnect Slack notifications?')) return;
    try {
      await fetch('/api/slack/disconnect', { method: 'POST' });
      setWebhookUrl('');
      setSlackMessage({ text: 'Slack disconnected.' });
      onRefresh();
    } catch (err) {
      console.error(err);
    }
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
    <div className="space-y-6 text-left text-xs">
      {/* 2-Column: Senders Quota + Slack Integration */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Senders & Hourly Quota Meters */}
        <div className="p-5 bg-slate-900/40 border border-slate-800 rounded-xl space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-400" />
              <span>Multi-Sender Hourly Rate Limits</span>
            </span>
            <span className="text-[11px] text-slate-400 font-mono">
              Sliding Window: 60 mins
            </span>
          </div>

          <p className="text-slate-400 leading-relaxed">
            Atomic Redis counters (<code>rl:sender:email:hourWindow</code>) track sending allocations.
            When saturated, BullMQ reschedules surplus jobs into the next hour window rather than dropping them.
          </p>

          <div className="space-y-3 pt-2">
            {senders.map((s) => {
              const current = s.usage?.currentCount || 0;
              const limit = s.hourly_limit;
              const pct = Math.min(100, Math.round((current / limit) * 100));
              const isOver = current >= limit;
              const isEditing = editingEmail === s.email;

              return (
                <div
                  key={s.id}
                  className="p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-lg space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-200">{s.name}</div>
                      <div className="font-mono text-[11px] text-slate-400">{s.email}</div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isEditing ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={1}
                            max={500}
                            value={editingLimit}
                            onChange={(e) => setEditingLimit(parseInt(e.target.value, 10))}
                            className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs font-mono"
                          />
                          <button
                            onClick={() => handleSaveSenderLimit(s.email)}
                            className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[11px] font-medium"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingEmail(null)}
                            className="px-2 py-1 bg-slate-800 text-slate-400 hover:text-white rounded text-[11px]"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setEditingEmail(s.email);
                              setEditingLimit(s.hourly_limit);
                            }}
                            className="text-[11px] text-indigo-400 hover:text-indigo-300 font-mono underline"
                          >
                            Edit Cap
                          </button>
                          <button
                            onClick={() => handleResetSenderWindow(s.email)}
                            title="Reset hourly counter for testing"
                            className="p-1 text-slate-500 hover:text-slate-300 rounded hover:bg-slate-800 transition-colors"
                          >
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-mono mb-1">
                      <span className="text-slate-400">Current Window Quota:</span>
                      <span className={`font-semibold tabular-nums ${isOver ? 'text-amber-400' : 'text-slate-200'}`}>
                        {current} / {limit} emails ({pct}%)
                      </span>
                    </div>

                    <div className="w-full bg-slate-800/80 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          isOver ? 'bg-amber-500' : pct > 75 ? 'bg-indigo-400' : 'bg-indigo-600'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Slack Notification Integration Card */}
        <div className="p-5 bg-slate-900/40 border border-slate-800 rounded-xl space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Bell className="w-4 h-4 text-indigo-400" />
              <span>Slack Rate-Limit Alert Dispatcher</span>
            </span>
            {slackConfig?.webhook_url || slackConfig?.has_token ? (
              <span className="font-mono text-[11px] text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-2 py-0.5 rounded flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                <span>Connected</span>
              </span>
            ) : (
              <span className="font-mono text-[11px] text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded">
                Not Connected
              </span>
            )}
          </div>

          <p className="text-slate-400 leading-relaxed">
            Dispatches live Block Kit alerts to your Slack workspace the exact millisecond any sender hits their hourly quota.
            If disconnected, rate limits still protect sending without crashing.
          </p>

          <form onSubmit={handleSaveSlack} className="space-y-3.5 pt-1">
            <div>
              <label className="block text-slate-300 font-medium mb-1 flex items-center justify-between">
                <span>Incoming Webhook URL</span>
                <span className="text-[11px] text-slate-500 font-mono">https://hooks.slack.com/services/...</span>
              </label>
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="Paste your Slack incoming webhook URL..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono text-[11px]"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Alert Channel</label>
              <input
                type="text"
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                placeholder="#email-rate-limit-alerts"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>

            {slackMessage && (
              <div
                className={`p-2.5 rounded-lg text-[11px] ${
                  slackMessage.isError
                    ? 'bg-rose-950/60 border border-rose-800/80 text-rose-300'
                    : 'bg-emerald-950/60 border border-emerald-800/80 text-emerald-300'
                }`}
              >
                {slackMessage.text}
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="submit"
                disabled={isSavingSlack}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white font-semibold rounded-lg text-xs transition-colors shadow-sm"
              >
                {isSavingSlack ? 'Saving...' : 'Save Slack Config'}
              </button>

              <button
                type="button"
                onClick={handleTestSlack}
                disabled={isTestingSlack || !webhookUrl}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Send className="w-3.5 h-3.5 text-indigo-400" />
                <span>{isTestingSlack ? 'Sending...' : 'Send Test Ping'}</span>
              </button>

              {(slackConfig?.webhook_url || slackConfig?.has_token) && (
                <button
                  type="button"
                  onClick={handleDisconnectSlack}
                  className="px-3 py-2 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded-lg text-xs transition-colors ml-auto"
                >
                  Disconnect
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* Rate Limit Events Audit Log Table */}
      <div className="border border-slate-800 rounded-xl bg-slate-900/40 overflow-hidden shadow-sm">
        <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
              Rate Limit Event Log & Reschedule Trail
            </h3>
          </div>
          <span className="font-mono text-slate-400 text-[11px]">
            {events.length} logged trigger{events.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 font-medium">
                <th className="py-2.5 px-4">Event ID</th>
                <th className="py-2.5 px-4">Sender</th>
                <th className="py-2.5 px-4">Window / Quota</th>
                <th className="py-2.5 px-4">Rescheduled Execution</th>
                <th className="py-2.5 px-4">Slack Alert</th>
                <th className="py-2.5 px-4 text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
              {events.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500 font-sans">
                    No rate limits reached yet. When a sender exceeds their hourly limit during a campaign,
                    the event and Slack dispatch details will be recorded here.
                  </td>
                </tr>
              ) : (
                events.map((ev) => (
                  <tr key={ev.id} className="hover:bg-slate-800/40 transition-colors text-slate-300">
                    <td className="py-2.5 px-4 text-slate-400">{ev.id}</td>
                    <td className="py-2.5 px-4 font-semibold text-slate-200">{ev.sender}</td>
                    <td className="py-2.5 px-4">
                      <span className="text-amber-400">{ev.count_attempted} attempts</span> / {ev.limit_value} cap
                    </td>
                    <td className="py-2.5 px-4 text-indigo-400">
                      {formatTimestamp(ev.rescheduled_to)}
                    </td>
                    <td className="py-2.5 px-4">
                      {ev.slack_notified ? (
                        <span className="text-emerald-400 inline-flex items-center gap-1 font-sans">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Delivered</span>
                        </span>
                      ) : (
                        <span className="text-slate-500 font-sans">Skipped</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right text-slate-400 tabular-nums">
                      {formatTimestamp(ev.created_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
