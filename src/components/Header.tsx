import React from 'react';
import { UserProfile } from '../types';
import { Plus, LogOut, CheckCircle2, User } from 'lucide-react';

interface HeaderProps {
  user: UserProfile | null;
  activeTab: 'scheduled' | 'sent' | 'queue' | 'rate-limits';
  onSelectTab: (tab: 'scheduled' | 'sent' | 'queue' | 'rate-limits') => void;
  onOpenCompose: () => void;
  onLogout: () => void;
  scheduledCount: number;
  sentCount: number;
  slackConnected: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  activeTab,
  onSelectTab,
  onOpenCompose,
  onLogout,
  scheduledCount,
  sentCount,
  slackConnected,
}) => {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-800 bg-[#0b0f19]/90 backdrop-blur-md px-6 py-3.5">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-8">
        {/* Zone 1: Brand Wordmark */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-sm">
            <span className="text-white font-bold text-sm tracking-wider">Q</span>
          </div>
          <div className="flex flex-col text-left leading-none">
            <span className="text-lg font-bold tracking-tight text-white whitespace-nowrap leading-none">
              Queue
            </span>
            <span className="text-[10px] text-slate-400 font-medium tracking-tight mt-0.5">
              (by ReachInbox)
            </span>
          </div>
        </div>

        {/* Zone 2: Navigation Links (Single-line, clear active states) */}
        <nav className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-lg border border-slate-800 text-sm">
          <button
            onClick={() => onSelectTab('scheduled')}
            className={`px-3.5 py-1.5 rounded-md font-medium text-xs transition-colors whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'scheduled'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <span>Scheduled</span>
            <span className="font-mono tabular-nums text-[11px] opacity-80 bg-black/20 px-1.5 py-0.5 rounded">
              {scheduledCount}
            </span>
          </button>

          <button
            onClick={() => onSelectTab('sent')}
            className={`px-3.5 py-1.5 rounded-md font-medium text-xs transition-colors whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'sent'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <span>Sent Emails</span>
            <span className="font-mono tabular-nums text-[11px] opacity-80 bg-black/20 px-1.5 py-0.5 rounded">
              {sentCount}
            </span>
          </button>

          <button
            onClick={() => onSelectTab('queue')}
            className={`px-3.5 py-1.5 rounded-md font-medium text-xs transition-colors whitespace-nowrap ${
              activeTab === 'queue'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            BullMQ Queue
          </button>

          <button
            onClick={() => onSelectTab('rate-limits')}
            className={`px-3.5 py-1.5 rounded-md font-medium text-xs transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'rate-limits'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <span>Rate Limits & Slack</span>
            {slackConnected && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Slack connected" />
            )}
          </button>
        </nav>

        {/* Zone 3: Actions + User Profile */}
        <div className="flex items-center gap-4 shrink-0">
          <button
            onClick={onOpenCompose}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-all whitespace-nowrap active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            <span>Compose New Email</span>
          </button>

          {user && (
            <div className="flex items-center gap-3 pl-3 border-l border-slate-800">
              {/* Anonymous profile avatar */}
              <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shadow-sm shrink-0">
                <User className="w-4 h-4 text-slate-400" />
              </div>

              <div className="hidden lg:flex flex-col text-left">
                <span className="text-xs font-semibold text-slate-200 leading-tight">
                  {user.name}
                </span>
                <span className="text-[11px] text-slate-400 font-mono truncate max-w-[170px]">
                  {user.email}
                </span>
              </div>

              <button
                onClick={onLogout}
                title="Log out"
                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800/60 rounded-md transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
