import React, { useState, useRef } from 'react';
import { SenderRecord } from '../types';
import { X, Upload, Mail, Clock, Zap, AlertCircle, FileText, CheckCircle2 } from 'lucide-react';

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  senders: SenderRecord[];
  onScheduledSuccess: () => void;
}

export const ComposeModal: React.FC<ComposeModalProps> = ({
  isOpen,
  onClose,
  senders,
  onScheduledSuccess,
}) => {
  const [selectedSender, setSelectedSender] = useState<string>(senders[0]?.email || 'growth@reachinbox.ai');
  const [subject, setSubject] = useState<string>('Accelerating pipeline velocity with ReachInbox');
  const [body, setBody] = useState<string>(
    'Hi {{firstName}},\n\nSaw your team is scaling outbound initiatives this quarter. ReachInbox provides persistent queue-backed email scheduling with multi-worker concurrency, zero drop rates, and real-time Slack rate-limit protection.\n\nWould you be open to a quick 10-minute briefing next Tuesday?\n\nBest regards,\nReachInbox Outbound'
  );

  const [leadInputText, setLeadInputText] = useState<string>('');
  const [detectedEmails, setDetectedEmails] = useState<string[]>([]);
  const [startTimeMode, setStartTimeMode] = useState<'immediate' | '5m' | '30m' | 'custom'>('immediate');
  const [customDateTime, setCustomDateTime] = useState<string>('');
  const [delaySeconds, setDelaySeconds] = useState<number>(2);
  const [hourlyLimit, setHourlyLimit] = useState<number>(20);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const parseEmailsFromString = (text: string) => {
    const rawMatches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    // Deduplicate
    const unique = Array.from(new Set(rawMatches.map((e) => e.toLowerCase().trim())));
    setDetectedEmails(unique);
    setLeadInputText(text);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      parseEmailsFromString(content);
    };
    reader.readAsText(file);
  };

  const handleFillSampleLeads = () => {
    const sample = `tim.cook@apple.com
satya.nadella@microsoft.com
sundar.pichai@google.com
sam.altman@openai.com
brian.chesky@airbnb.com`;
    parseEmailsFromString(sample);
  };

  const calculateStartTime = (): number => {
    const now = Date.now();
    if (startTimeMode === 'immediate') return now;
    if (startTimeMode === '5m') return now + 5 * 60 * 1000;
    if (startTimeMode === '30m') return now + 30 * 60 * 1000;
    if (startTimeMode === 'custom' && customDateTime) {
      const parsed = new Date(customDateTime).getTime();
      return !isNaN(parsed) && parsed > now ? parsed : now;
    }
    return now;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (detectedEmails.length === 0) {
      setErrorMsg('Please upload a CSV or paste at least one valid recipient email address.');
      return;
    }

    if (!subject.trim() || !body.trim()) {
      setErrorMsg('Subject and email body cannot be empty.');
      return;
    }

    setIsSubmitting(true);

    try {
      const startTime = calculateStartTime();
      const res = await fetch('/api/emails/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: selectedSender,
          subject,
          body,
          recipients: detectedEmails,
          startTime: startTime,
          delayBetweenEmailsMs: delaySeconds * 1000,
          hourlyLimit: hourlyLimit,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to schedule campaign');
      }

      onScheduledSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl bg-[#0f172a] border border-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-semibold text-white">Compose & Schedule Outbound Sequence</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5 text-left text-xs">
          {errorMsg && (
            <div className="flex items-center gap-2 p-3 bg-rose-950/60 border border-rose-800/80 rounded-lg text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Sender Dropdown */}
          <div>
            <label className="block text-slate-300 font-medium mb-1.5">Sending Account</label>
            <select
              value={selectedSender}
              onChange={(e) => setSelectedSender(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono text-xs"
            >
              {senders.map((s) => (
                <option key={s.id} value={s.email}>
                  {s.name} ({s.email}) — Limit: {s.hourly_limit}/hr
                </option>
              ))}
            </select>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-slate-300 font-medium mb-1.5">Subject Line</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Scaling revenue pipeline with ReachInbox"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 text-xs"
              required
            />
          </div>

          {/* Email Body */}
          <div>
            <label className="block text-slate-300 font-medium mb-1.5">Email Body</label>
            <textarea
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 text-xs font-mono leading-relaxed"
              required
            />
          </div>

          {/* Lead Recipients & CSV Upload */}
          <div className="border border-slate-800/80 rounded-lg p-4 bg-slate-950/50 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-300 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-indigo-400" />
                <span>Recipient Leads</span>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleFillSampleLeads}
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 underline font-medium"
                >
                  Fill Sample Leads (5 leads)
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] font-medium flex items-center gap-1 transition-colors"
                >
                  <Upload className="w-3 h-3" />
                  <span>Upload CSV/Text</span>
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".csv,.txt"
                  className="hidden"
                />
              </div>
            </div>

            <textarea
              rows={3}
              value={leadInputText}
              onChange={(e) => parseEmailsFromString(e.target.value)}
              placeholder="Paste email leads separated by commas or line breaks (or upload a .csv file above)..."
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 text-xs font-mono"
            />

            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <div className="flex items-center gap-1.5">
                {detectedEmails.length > 0 ? (
                  <span className="text-emerald-400 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{detectedEmails.length} valid email address{detectedEmails.length !== 1 ? 'es' : ''} detected</span>
                  </span>
                ) : (
                  <span>No valid recipients detected yet</span>
                )}
              </div>
              {detectedEmails.length > 0 && (
                <span className="font-mono text-slate-500 truncate max-w-[280px]">
                  Sample: {detectedEmails.slice(0, 3).join(', ')}
                  {detectedEmails.length > 3 ? '...' : ''}
                </span>
              )}
            </div>
          </div>

          {/* Scheduling Configuration Controls */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-slate-950/70 border border-slate-800 rounded-lg">
            {/* Start Time */}
            <div>
              <label className="block text-slate-300 font-medium mb-1.5 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                <span>Start Time</span>
              </label>
              <div className="grid grid-cols-2 gap-1 mb-2">
                <button
                  type="button"
                  onClick={() => setStartTimeMode('immediate')}
                  className={`py-1 text-[11px] rounded font-medium transition-colors ${
                    startTimeMode === 'immediate'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Send Now
                </button>
                <button
                  type="button"
                  onClick={() => setStartTimeMode('5m')}
                  className={`py-1 text-[11px] rounded font-medium transition-colors ${
                    startTimeMode === '5m'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  +5 Mins
                </button>
                <button
                  type="button"
                  onClick={() => setStartTimeMode('30m')}
                  className={`py-1 text-[11px] rounded font-medium transition-colors ${
                    startTimeMode === '30m'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  +30 Mins
                </button>
                <button
                  type="button"
                  onClick={() => setStartTimeMode('custom')}
                  className={`py-1 text-[11px] rounded font-medium transition-colors ${
                    startTimeMode === 'custom'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Custom
                </button>
              </div>

              {startTimeMode === 'custom' && (
                <input
                  type="datetime-local"
                  value={customDateTime}
                  onChange={(e) => setCustomDateTime(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 text-[11px]"
                />
              )}
            </div>

            {/* Delay Between Sends */}
            <div>
              <label className="block text-slate-300 font-medium mb-1.5 flex items-center justify-between">
                <span>Delay Between Emails</span>
                <span className="font-mono text-indigo-400">{delaySeconds}s</span>
              </label>
              <input
                type="range"
                min={1}
                max={15}
                step={1}
                value={delaySeconds}
                onChange={(e) => setDelaySeconds(parseInt(e.target.value, 10))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
              <span className="block text-[11px] text-slate-500 mt-1 leading-snug">
                Provider throttling minimum delay between each dispatch.
              </span>
            </div>

            {/* Hourly Rate Limit */}
            <div>
              <label className="block text-slate-300 font-medium mb-1.5 flex items-center justify-between">
                <span>Hourly Limit (Cap)</span>
                <span className="font-mono text-indigo-400">{hourlyLimit}/hr</span>
              </label>
              <input
                type="number"
                min={5}
                max={200}
                value={hourlyLimit}
                onChange={(e) => setHourlyLimit(parseInt(e.target.value, 10))}
                className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-slate-200 font-mono text-xs focus:outline-none focus:border-indigo-500"
              />
              <span className="block text-[11px] text-slate-500 mt-1 leading-snug">
                Surplus emails rescheduled into next hour window (no drops).
              </span>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-slate-400 hover:text-slate-200 text-xs font-medium rounded-lg hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || detectedEmails.length === 0}
              className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold text-xs rounded-lg shadow-sm transition-all active:scale-[0.98]"
            >
              <Zap className="w-4 h-4" />
              <span>
                {isSubmitting
                  ? 'Scheduling...'
                  : `Schedule ${detectedEmails.length} Email${detectedEmails.length !== 1 ? 's' : ''}`}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
