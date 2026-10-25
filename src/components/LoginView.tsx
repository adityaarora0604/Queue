import React from 'react';
import { Mail, Shield, Zap, Server } from 'lucide-react';

interface LoginViewProps {
  onLogin: () => void;
  isLoading?: boolean;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLogin, isLoading }) => {
  return (
    <div className="min-h-screen bg-[#0b0f19] flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden">
      {/* Background subtle radial glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md bg-[#0f172a] border border-slate-800 rounded-2xl shadow-2xl p-8 space-y-6 text-center">
        {/* Brand Lockup */}
        <div className="flex flex-col items-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <span className="text-white font-bold text-lg tracking-wider">Q</span>
          </div>
          <div className="flex flex-col items-center">
            <h1 className="text-2xl font-bold text-white tracking-tight leading-none">Queue</h1>
            <span className="text-xs text-slate-400 font-medium tracking-wide mt-1">(by ReachInbox)</span>
            <p className="text-xs text-slate-400 mt-2">Enterprise Email Scheduler & Rate-Limiting Engine</p>
          </div>
        </div>

        {/* Feature Highlights */}
        <div className="py-2 space-y-2.5 text-left border-y border-slate-800/80 text-xs text-slate-300">
          <div className="flex items-center gap-2.5">
            <Server className="w-4 h-4 text-indigo-400 shrink-0" />
            <span>BullMQ + Redis persistent queue (zero cron jobs)</span>
          </div>
          <div className="flex items-center gap-2.5">
            <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Multi-worker concurrency with inter-email throttling</span>
          </div>
          <div className="flex items-center gap-2.5">
            <Zap className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Redis sliding hourly limits + live Slack notifications</span>
          </div>
          <div className="flex items-center gap-2.5">
            <Mail className="w-4 h-4 text-blue-400 shrink-0" />
            <span>Ethereal SMTP with one-click rendered email previews</span>
          </div>
        </div>

        {/* Google Sign-In Button */}
        <div className="space-y-3">
          <button
            onClick={onLogin}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 py-2.5 px-4 bg-white hover:bg-slate-100 text-slate-900 rounded-lg font-semibold text-xs transition-all shadow-sm active:scale-[0.98] disabled:opacity-60"
          >
            {/* Google G logo */}
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>{isLoading ? 'Signing in with Google...' : 'Sign in with Google'}</span>
          </button>

          <p className="text-[11px] text-slate-500 font-mono">
            Logging in as verified user: aditya6april2004@gmail.com
          </p>
        </div>
      </div>
    </div>
  );
};
