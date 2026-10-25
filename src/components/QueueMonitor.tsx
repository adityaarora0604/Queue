import React, { useState } from 'react';
import { QueueTelemetry } from '../types';
import {
  Activity,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Zap,
  ExternalLink,
  Server,
  Sliders,
  RefreshCw,
  Trash2,
} from 'lucide-react';

interface QueueMonitorProps {
  telemetry: QueueTelemetry | null;
  onRefresh: () => void;
  onConcurrencyChange: (concurrency: number) => void;
}

export const QueueMonitor: React.FC<QueueMonitorProps> = ({
  telemetry,
  onRefresh,
  onConcurrencyChange,
}) => {
  const [isRestarting, setIsRestarting] = useState(false);
  const [restartResult, setRestartResult] = useState<any | null>(null);
  const [isLoadTesting, setIsLoadTesting] = useState(false);
  const [loadTestResult, setLoadTestResult] = useState<string | null>(null);
  const [isCleaning, setIsCleaning] = useState(false);

  const handleSimulateRestart = async () => {
    setIsRestarting(true);
    setRestartResult(null);
    try {
      const res = await fetch('/api/system/simulate-restart', { method: 'POST' });
      const data = await res.json();
      setRestartResult(data);
      onRefresh();
    } catch (err: any) {
      setRestartResult({ error: err.message });
    } finally {
      setIsRestarting(false);
    }
  };

  const handleQuickLoadTest = async (count: number) => {
    setIsLoadTesting(true);
    setLoadTestResult(null);
    try {
      const res = await fetch('/api/system/quick-load-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count }),
      });
      const data = await res.json();
      setLoadTestResult(data.message);
      onRefresh();
    } catch (err: any) {
      setLoadTestResult(`Error: ${err.message}`);
    } finally {
      setIsLoadTesting(false);
    }
  };

  const handleCleanQueue = async () => {
    if (!confirm('Clean completed and failed job history from Redis?')) return;
    setIsCleaning(true);
    try {
      await fetch('/api/queue/clean', { method: 'POST' });
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setIsCleaning(false);
    }
  };

  return (
    <div className="space-y-6 text-left">
      {/* Top Banner / Bull Board Link */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-400" />
            <h2 className="text-sm font-semibold text-slate-100">
              BullMQ Distributed Queue Engine
            </h2>
            <span className="font-mono text-[11px] text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-2 py-0.5 rounded">
              Redis Connected
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Backing delayed jobs, worker concurrency, and atomic rate limit throttles. No cron jobs used.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
            title="Refresh queue counts"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>

          <a
            href="/admin/queues"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <span>Live Bull Board UI</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {/* Delayed */}
        <div className="p-4 bg-slate-900/40 border border-slate-800 rounded-xl">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Delayed Jobs</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-white">
            {telemetry?.delayed ?? 0}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">Scheduled for future execution</div>
        </div>

        {/* Active */}
        <div className="p-4 bg-slate-900/40 border border-slate-800 rounded-xl">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Active Worker Jobs</span>
            <Activity className="w-4 h-4 text-blue-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-blue-400">
            {telemetry?.active ?? 0}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">Currently in worker execution</div>
        </div>

        {/* Waiting */}
        <div className="p-4 bg-slate-900/40 border border-slate-800 rounded-xl">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Waiting in Queue</span>
            <RotateCcw className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-200">
            {telemetry?.waiting ?? 0}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">Ready to be picked up</div>
        </div>

        {/* Completed */}
        <div className="p-4 bg-slate-900/40 border border-slate-800 rounded-xl">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Completed</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-emerald-400">
            {telemetry?.completed ?? 0}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">Delivered via Ethereal SMTP</div>
        </div>

        {/* Failed */}
        <div className="p-4 bg-slate-900/40 border border-slate-800 rounded-xl">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Failed</span>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-rose-400">
            {telemetry?.failed ?? 0}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">Failed after retries</div>
        </div>
      </div>

      {/* Worker Settings & Throttling Parameters */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Worker Concurrency Card */}
        <div className="p-5 bg-slate-900/40 border border-slate-800 rounded-xl space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-400" />
              <span>Worker Concurrency</span>
            </span>
            <span className="font-mono text-sm font-bold text-indigo-400 tabular-nums">
              {telemetry?.concurrency ?? 5} parallel jobs
            </span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Adjust the number of parallel BullMQ workers processing email sends simultaneously. Changes take effect immediately.
          </p>

          <div className="flex items-center gap-3">
            {[1, 3, 5, 10, 15].map((lvl) => (
              <button
                key={lvl}
                onClick={() => onConcurrencyChange(lvl)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors ${
                  telemetry?.concurrency === lvl
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                {lvl}x
              </button>
            ))}
          </div>

          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
            <span>Inter-Email Minimum Delay:</span>
            <span className="font-mono text-slate-200">{telemetry?.minDelayMs ?? 2000}ms (2 seconds)</span>
          </div>
        </div>

        {/* Server Restart & Persistence Testing Card */}
        <div className="p-5 bg-slate-900/40 border border-slate-800 rounded-xl space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Server className="w-4 h-4 text-indigo-400" />
              <span>Restart & Persistence Proof</span>
            </span>
            <button
              onClick={handleCleanQueue}
              disabled={isCleaning}
              className="text-[11px] text-slate-400 hover:text-slate-300 flex items-center gap-1"
              title="Clear completed job logs"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear History</span>
            </button>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Test the non-negotiable requirement: when the server reboots, future scheduled jobs survive in BullMQ/Redis and SQLite, with zero duplicated emails.
          </p>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSimulateRestart}
              disabled={isRestarting}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isRestarting ? 'animate-spin' : ''}`} />
              <span>{isRestarting ? 'Testing Recovery...' : 'Simulate Server Restart'}</span>
            </button>

            <button
              onClick={() => handleQuickLoadTest(15)}
              disabled={isLoadTesting}
              className="px-3.5 py-2 bg-indigo-950/70 hover:bg-indigo-900 border border-indigo-800/80 disabled:opacity-50 text-indigo-300 hover:text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors"
            >
              <Zap className="w-3.5 h-3.5 text-indigo-400" />
              <span>{isLoadTesting ? 'Injecting...' : 'Quick Load Burst (15 Leads)'}</span>
            </button>
          </div>

          {restartResult && (
            <div className="p-2.5 bg-emerald-950/50 border border-emerald-800/70 rounded-lg text-[11px] text-emerald-300 font-mono">
              ✓ {restartResult.message} (Checked: {restartResult.recoveryResult?.checkedCount}, Re-verified: {restartResult.recoveryResult?.recoveredCount})
            </div>
          )}

          {loadTestResult && (
            <div className="p-2.5 bg-indigo-950/50 border border-indigo-800/70 rounded-lg text-[11px] text-indigo-300">
              {loadTestResult}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
