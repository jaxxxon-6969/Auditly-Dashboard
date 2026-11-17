import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeftRight, LogOut, Menu } from 'lucide-react';
import { NavRoute } from '../types/audit';
import { AuditlyIdentity, runtimeConfig } from '../services/authService';

interface TopHeaderProps {
  activeRoute: NavRoute;
  todayLabel: string;
  onOpenMobileMenu: () => void;
  onNavigate: (route: NavRoute) => void;
  identity?: AuditlyIdentity | null;
  workspaceName?: string;
  onSignOut: () => void;
  onSwitchWorkspace: () => void;
}

const PAGE_TITLES: Record<NavRoute, string> = {
  dashboard: 'Dashboard Overview',
  upload: 'Upload Documents',
  employees: 'Employee Records',
  verification: 'Contribution Verification',
  'manual-review': 'Manual Review',
  reports: 'Reports',
  settings: 'Settings',
};

export const TopHeader: React.FC<TopHeaderProps> = ({
  activeRoute,
  todayLabel,
  onOpenMobileMenu,
  onNavigate,
  identity,
  workspaceName,
  onSignOut,
  onSwitchWorkspace,
}) => {
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentTitle = PAGE_TITLES[activeRoute];
  const profileName = identity?.role === 'client'
    ? identity.clientName ?? identity.email
    : identity?.email === 'local'
      ? 'JACKSON ABRAHAM'
      : identity?.email?.split('@')[0]?.replace(/[._-]+/g, ' ').toUpperCase() ?? 'AUDITLY USER';
  const initials = profileName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('') || 'AU';

  return (
    <header className="h-[46px] shrink-0 bg-[#FFFFFF] border-b-2 border-[#1E293B] px-3.5 flex items-center justify-between gap-3 z-30">
      <div className="flex items-center gap-2.5 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Open navigation menu"
          className="lg:hidden p-1.5 rounded-[4px] border-2 border-[#1E293B] bg-[#FDF9F6] text-[#0F172A] hover:bg-[#ECE6FD]"
        >
          <Menu className="w-4 h-4" />
        </button>
        <div className="flex items-baseline gap-2 min-w-0">
          <h1 className="font-display text-[15px] lg:text-[16px] font-bold text-[#0F172A] tracking-tight whitespace-nowrap truncate">
            {currentTitle}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <span
          aria-label={`Current date: ${todayLabel}`}
          className="inline-flex items-center px-2 py-1 bg-[#ECE6FD] border-2 border-[#1E293B] rounded-[4px] text-[10px] sm:text-[11px] font-bold text-[#0F172A] whitespace-nowrap"
        >
          {todayLabel}
        </span>
        <div className="relative" ref={profileRef}>
          <button
            type="button"
            onClick={() => {
              setProfileOpen((prev) => !prev);
            }}
            aria-label="Open auditor profile menu"
            className="flex items-center gap-1.5 pl-1 pr-2 py-0.5 bg-[#FFFFFF] border-2 border-[#1E293B] rounded-[4px] hover:bg-[#ECE6FD] transition-colors cursor-pointer"
          >
            <div className="w-5 h-5 rounded-[3px] bg-[#0E0E10] text-[#FFFFFF] text-[10px] font-display font-bold flex items-center justify-center">
              {initials}
            </div>
              <span className="hidden sm:inline max-w-40 truncate text-[11px] font-semibold text-[#0F172A] whitespace-nowrap">
              {profileName}
            </span>
          </button>

          {profileOpen && (
            <div className="absolute right-0 mt-2 w-60 bg-[#FFFFFF] border-2 border-[#1E293B] rounded-[4px] shadow-[4px_4px_0px_#0E0E10] z-50">
              <div className="p-3 border-b border-[#E2DCD5]">
                <div className="text-xs font-bold text-[#0F172A]">{profileName}</div>
                <div className="text-[11px] text-[#64748B]">{identity?.email ?? 'Lead Payroll Auditor'}</div>
                {workspaceName && <div className="mt-1 truncate text-[10px] font-semibold text-[#7C5CE0]">{workspaceName}</div>}
              </div>
              <div className="p-1.5 space-y-1">
                {identity?.role !== 'client' && (
                  <>
                    <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    onNavigate('settings');
                  }}
                  className="w-full text-left px-2.5 py-1.5 text-xs font-medium text-[#0F172A] hover:bg-[#ECE6FD] rounded-[3px] cursor-pointer"
                >
                    Audit Threshold Settings
                    </button>
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    onNavigate('reports');
                  }}
                  className="w-full text-left px-2.5 py-1.5 text-xs font-medium text-[#0F172A] hover:bg-[#ECE6FD] rounded-[3px] cursor-pointer"
                >
                    Export Summary Reports
                </button>
                    {runtimeConfig.authEnabled && (
                      <button type="button" onClick={() => { setProfileOpen(false); onSwitchWorkspace(); }} className="w-full flex items-center gap-2 text-left px-2.5 py-1.5 text-xs font-medium text-[#0F172A] hover:bg-[#ECE6FD] rounded-[3px] cursor-pointer">
                        <ArrowLeftRight className="h-3.5 w-3.5" /> Switch client workspace
                      </button>
                    )}
                  </>
                )}
                {runtimeConfig.authEnabled && (
                  <button type="button" onClick={() => { setProfileOpen(false); onSignOut(); }} className="w-full flex items-center gap-2 text-left px-2.5 py-1.5 text-xs font-medium text-[#0F172A] hover:bg-[#ECE6FD] rounded-[3px] cursor-pointer">
                    <LogOut className="h-3.5 w-3.5" /> Sign out
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
