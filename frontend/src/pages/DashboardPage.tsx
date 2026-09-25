import React, { useState, useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { Avatar, Badge, EmptyState, Modal } from '../components';
import { ComposeEmail } from '../features/compose/ComposeEmail';
import {
  Search,
  Plus,
  Clock,
  Send,
  LogOut,
  ChevronDown,
  Sparkles,
  Calendar,
} from 'lucide-react';

export interface DashboardOutletContext {
  onOpenCompose: () => void;
  searchQuery: string;
  refreshCounts: () => void;
}

export const DashboardPage: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [searchQuery, setSearchQuery] = useState('');

  const [isComposeOpen, setIsComposeOpen] = useState(false);

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [scheduledCount, setScheduledCount] = useState<number>(0);
  const [sentCount, setSentCount] = useState<number>(0);

  const refreshCounts = async () => {
    try {
      const [scheduledRes, sentRes] = await Promise.all([
        apiRequest<{ pagination?: { total: number } }>('/api/emails/scheduled?limit=1').catch(() => null),
        apiRequest<{ pagination?: { total: number } }>('/api/emails/sent?limit=1').catch(() => null),
      ]);

      if (scheduledRes?.pagination?.total !== undefined) {
        setScheduledCount(scheduledRes.pagination.total);
      }
      if (sentRes?.pagination?.total !== undefined) {
        setSentCount(sentRes.pagination.total);
      }
    } catch {
    }
  };

  useEffect(() => {
    refreshCounts();
  }, [location.pathname]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDropdownOpen]);

  const handleLogout = async () => {
    setIsDropdownOpen(false);
    await logout();
    navigate('/login', { replace: true });
  };

  const isScheduledActive = location.pathname.includes('/scheduled');
  const isSentActive = location.pathname.includes('/sent');

  return (
    <div className="min-h-screen bg-slate-50/60 text-slate-800 flex flex-row font-sans">

      <aside className="w-64 sm:w-72 bg-white border-r border-slate-200/80 flex flex-col shrink-0 min-h-screen sticky top-0 h-screen select-none z-20">

        <div className="h-16 px-5 border-b border-slate-100 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-sm shadow-emerald-600/30">
            <Send className="w-4 h-4 text-white -rotate-12 translate-x-0.5" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-base tracking-tight text-slate-900 leading-none">
              ReachInbox
            </span>
            <span className="text-[11px] text-slate-400 font-medium mt-1">
              Email Scheduler
            </span>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-4 flex-1">

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search emails..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200/90 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-all shadow-2xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs px-1"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setIsComposeOpen(true)}
            className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-medium text-xs sm:text-sm transition-all duration-150 shadow-sm shadow-emerald-600/25 flex items-center justify-center gap-2 cursor-pointer group"
          >
            <Plus className="w-4 h-4 transition-transform group-hover:rotate-90 duration-200" />
            <span>Compose</span>
          </button>

          <nav className="flex flex-col gap-1.5 pt-2">

            <NavLink
              to="/dashboard/scheduled"
              className={({ isActive }) =>
                `flex items-center justify-between px-3.5 py-2.5 rounded-full text-xs sm:text-sm font-medium transition-all group ${
                  isActive
                    ? 'bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200/70 shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-100/70 hover:text-slate-900 border border-transparent'
                }`
              }
            >
              <div className="flex items-center gap-2.5">
                <Clock
                  className={`w-4 h-4 transition-colors ${
                    isScheduledActive ? 'text-emerald-600' : 'text-slate-400 group-hover:text-slate-600'
                  }`}
                />
                <span>Scheduled</span>
              </div>
              <Badge
                variant={isScheduledActive ? 'green' : 'neutral'}
                size="sm"
                className={isScheduledActive ? 'font-semibold' : 'text-slate-500'}
              >
                {scheduledCount}
              </Badge>
            </NavLink>

            <NavLink
              to="/dashboard/sent"
              className={({ isActive }) =>
                `flex items-center justify-between px-3.5 py-2.5 rounded-full text-xs sm:text-sm font-medium transition-all group ${
                  isActive
                    ? 'bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200/70 shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-100/70 hover:text-slate-900 border border-transparent'
                }`
              }
            >
              <div className="flex items-center gap-2.5">
                <Send
                  className={`w-4 h-4 transition-colors ${
                    isSentActive ? 'text-emerald-600' : 'text-slate-400 group-hover:text-slate-600'
                  }`}
                />
                <span>Sent</span>
              </div>
              <Badge
                variant={isSentActive ? 'green' : 'neutral'}
                size="sm"
                className={isSentActive ? 'font-semibold' : 'text-slate-500'}
              >
                {sentCount}
              </Badge>
            </NavLink>
          </nav>
        </div>

        <div className="p-4 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-between">
          <span>ReachInbox v1.0</span>
          <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Online
          </span>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 min-h-screen">

        <header className="h-16 border-b border-slate-200/80 bg-white/90 backdrop-blur-md px-6 sm:px-8 flex items-center justify-between sticky top-0 z-30 shadow-2xs">

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold text-xs shadow-sm">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <h1 className="text-sm font-semibold text-slate-900 leading-none">
                  {isScheduledActive ? 'Scheduled Campaigns' : 'Dispatched Emails'}
                </h1>
                <p className="text-[11px] text-slate-400 mt-1">
                  {isScheduledActive
                    ? 'Manage pending deliveries and rate limiter queues'
                    : 'History of delivered emails with Ethereal preview confirmations'}
                </p>
              </div>
            </div>
          </div>

          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center gap-2.5 p-1 rounded-full hover:bg-slate-100/80 transition-colors focus:outline-none cursor-pointer select-none"
              title="User profile and settings"
              aria-expanded={isDropdownOpen}
            >
              <Avatar
                src={user?.avatarUrl || user?.picture || user?.photoUrl}
                name={user?.name}
                email={user?.email}
                size="md"
              />
              <div className="hidden md:flex flex-col text-left pr-1">
                <span className="text-xs font-semibold text-slate-800 leading-tight">
                  {user?.name || 'Authenticated User'}
                </span>
                <span className="text-[10px] text-slate-400 leading-tight truncate max-w-[130px]">
                  {user?.email || 'user@example.com'}
                </span>
              </div>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 ${
                  isDropdownOpen ? 'rotate-180 text-slate-600' : ''
                }`}
              />
            </button>

            {isDropdownOpen && (
              <div className="absolute right-0 mt-2 w-60 bg-white border border-slate-200/90 rounded-xl shadow-xl py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">

                <div className="px-4 py-2.5 border-b border-slate-100">
                  <p className="text-xs font-semibold text-slate-900 truncate">
                    {user?.name || 'User'}
                  </p>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5">
                    {user?.email || ''}
                  </p>
                  <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-medium border border-emerald-100">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Google OAuth Connected
                  </div>
                </div>

                <div className="p-1">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50/80 flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5 text-red-500" />
                    <span>Sign out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 p-6 sm:p-8 max-w-6xl w-full mx-auto flex flex-col gap-6">
          <Outlet
            context={{
              onOpenCompose: () => setIsComposeOpen(true),
              searchQuery,
              refreshCounts,
            }}
          />
        </main>
      </div>

      <Modal
        isOpen={isComposeOpen}
        onClose={() => setIsComposeOpen(false)}
        title="Compose New Email"
        maxWidth="max-w-2xl"
      >
        <ComposeEmail
          onClose={() => setIsComposeOpen(false)}
          onSuccess={() => {
            setIsComposeOpen(false);
            refreshCounts();
          }}
        />
      </Modal>
    </div>
  );
};

export const ScheduledTabStub: React.FC = () => {
  const context = useOutletContext<DashboardOutletContext>();
  const onOpenCompose = context?.onOpenCompose;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">
            Scheduled Emails
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Pending email jobs waiting in BullMQ Redis delayed set
          </p>
        </div>
      </div>

      <EmptyState
        icon={<Calendar className="w-7 h-7 text-emerald-600" />}
        title="No scheduled emails"
        description="Emails you compose and schedule for later delivery will appear here with real-time countdowns."
        action={
          onOpenCompose
            ? {
                label: 'Compose new email',
                icon: <Plus className="w-4 h-4" />,
                onClick: onOpenCompose,
              }
            : undefined
        }
      />
    </div>
  );
};

export const SentTabStub: React.FC = () => {
  const context = useOutletContext<DashboardOutletContext>();
  const onOpenCompose = context?.onOpenCompose;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">
            Sent Emails
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Emails successfully dispatched through Ethereal SMTP with visual preview URLs
          </p>
        </div>
      </div>

      <EmptyState
        icon={<Send className="w-7 h-7 text-emerald-600" />}
        title="No sent emails yet"
        description="All dispatched emails with delivery timestamps and Ethereal preview links will be listed here."
        action={
          onOpenCompose
            ? {
                label: 'Schedule an email',
                icon: <Plus className="w-4 h-4" />,
                onClick: onOpenCompose,
              }
            : undefined
        }
      />
    </div>
  );
};

export default DashboardPage;
