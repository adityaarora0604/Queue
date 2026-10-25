/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { ScheduledEmailsTable } from './components/ScheduledEmailsTable';
import { SentEmailsTable } from './components/SentEmailsTable';
import { QueueMonitor } from './components/QueueMonitor';
import { RateLimitSlackPanel } from './components/RateLimitSlackPanel';
import { ComposeModal } from './components/ComposeModal';
import { LoginView } from './components/LoginView';
import { EmailRecord, QueueTelemetry, RateLimitEvent, SenderRecord, SlackConfig, UserProfile } from './types';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(true);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<'scheduled' | 'sent' | 'queue' | 'rate-limits'>('scheduled');
  const [isComposeOpen, setIsComposeOpen] = useState<boolean>(false);

  const [scheduledEmails, setScheduledEmails] = useState<EmailRecord[]>([]);
  const [sentEmails, setSentEmails] = useState<EmailRecord[]>([]);
  const [senders, setSenders] = useState<SenderRecord[]>([]);
  const [telemetry, setTelemetry] = useState<QueueTelemetry | null>(null);
  const [rateLimitEvents, setRateLimitEvents] = useState<RateLimitEvent[]>([]);
  const [slackConfig, setSlackConfig] = useState<SlackConfig | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Fetch current user
  const fetchUser = async () => {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (data.authenticated && data.user) {
        setUser(data.user);
        setIsAuthenticated(true);
      }
    } catch (err) {
      console.error('Failed to fetch user:', err);
    }
  };

  // Fetch all dashboard data
  const fetchData = useCallback(async () => {
    try {
      const [scheduledRes, sentRes, sendersRes, telemetryRes, eventsRes, slackRes] = await Promise.all([
        fetch('/api/emails/scheduled'),
        fetch('/api/emails/sent'),
        fetch('/api/senders'),
        fetch('/api/queue/telemetry'),
        fetch('/api/rate-limits/events'),
        fetch('/api/slack/config'),
      ]);

      if (scheduledRes.ok) {
        const sched = await scheduledRes.json();
        setScheduledEmails(sched);
      }
      if (sentRes.ok) {
        const sent = await sentRes.json();
        setSentEmails(sent);
      }
      if (sendersRes.ok) {
        const snd = await sendersRes.json();
        setSenders(snd);
      }
      if (telemetryRes.ok) {
        const telem = await telemetryRes.json();
        setTelemetry(telem);
      }
      if (eventsRes.ok) {
        const ev = await eventsRes.json();
        setRateLimitEvents(ev);
      }
      if (slackRes.ok) {
        const slk = await slackRes.json();
        setSlackConfig(slk);
      }
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchUser();
    fetchData();

    // Fast polling every 2.5 seconds for live queue telemetry & execution updates
    const interval = setInterval(() => {
      fetchData();
    }, 2500);

    return () => clearInterval(interval);
  }, [fetchData]);

  const handleLogin = async () => {
    setIsLoading(true);
    await fetchUser();
    await fetchData();
    setIsAuthenticated(true);
    setIsLoading(false);
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error(e);
    }
    setUser(null);
    setIsAuthenticated(false);
  };

  const handleConcurrencyChange = async (concurrency: number) => {
    try {
      const res = await fetch('/api/queue/concurrency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concurrency }),
      });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (!isAuthenticated) {
    return <LoginView onLogin={handleLogin} isLoading={isLoading} />;
  }

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col antialiased selection:bg-indigo-500 selection:text-white">
      {/* 3-Zone Header Contract */}
      <Header
        user={user}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenCompose={() => setIsComposeOpen(true)}
        onLogout={handleLogout}
        scheduledCount={scheduledEmails.length}
        sentCount={sentEmails.length}
        slackConnected={Boolean(slackConfig?.webhook_url || slackConfig?.has_token)}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-6 space-y-6">
        {activeTab === 'scheduled' && (
          <ScheduledEmailsTable
            emails={scheduledEmails}
            isLoading={isLoading}
            onRefresh={fetchData}
            onOpenCompose={() => setIsComposeOpen(true)}
          />
        )}

        {activeTab === 'sent' && (
          <SentEmailsTable
            emails={sentEmails}
            isLoading={isLoading}
            onOpenCompose={() => setIsComposeOpen(true)}
          />
        )}

        {activeTab === 'queue' && (
          <QueueMonitor
            telemetry={telemetry}
            onRefresh={fetchData}
            onConcurrencyChange={handleConcurrencyChange}
          />
        )}

        {activeTab === 'rate-limits' && (
          <RateLimitSlackPanel
            senders={senders}
            events={rateLimitEvents}
            slackConfig={slackConfig}
            onRefresh={fetchData}
          />
        )}
      </main>

      {/* Compose & Schedule Modal */}
      <ComposeModal
        isOpen={isComposeOpen}
        onClose={() => setIsComposeOpen(false)}
        senders={senders}
        onScheduledSuccess={() => {
          fetchData();
          setActiveTab('scheduled');
        }}
      />
    </div>
  );
}
