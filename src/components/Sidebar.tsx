import React from 'react';
import {
  LayoutDashboard,
  UploadCloud,
  Users,
  GitCompareArrows,
  UserCheck,
  FileBarChart2,
  Settings,
  X,
} from 'lucide-react';
import { NavRoute } from '../types/audit';
import { BrandLogo } from './BrandLogo';

interface SidebarProps {
  activeRoute: NavRoute;
  onNavigate: (route: NavRoute) => void;
  flaggedCount: number;
  pendingReviewCount: number;
  clientViewer?: boolean;
  accountName?: string;
  accountRole?: string;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

interface NavItemConfig {
  id: NavRoute;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  badgeTone?: 'lilac' | 'amber';
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeRoute,
  onNavigate,
  flaggedCount,
  pendingReviewCount,
  clientViewer = false,
  accountName = 'JACKSON ABRAHAM',
  accountRole = 'Lead Payroll Auditor',
  mobileOpen,
  onCloseMobile,
}) => {
  const primaryNav: NavItemConfig[] = clientViewer
    ? [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'employees', label: 'Employee Records', icon: Users },
        { id: 'verification', label: 'Verification Grid', icon: GitCompareArrows, badge: flaggedCount, badgeTone: 'lilac' },
      ]
    : [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'upload', label: 'Upload Documents', icon: UploadCloud },
        { id: 'employees', label: 'Employee Records', icon: Users },
        { id: 'verification', label: 'Verification Grid', icon: GitCompareArrows, badge: flaggedCount, badgeTone: 'lilac' },
        { id: 'manual-review', label: 'Manual Review', icon: UserCheck, badge: pendingReviewCount, badgeTone: 'amber' },
      ];

  const secondaryNav: NavItemConfig[] = clientViewer
    ? [{ id: 'reports', label: 'Reports', icon: FileBarChart2 }]
    : [
        { id: 'reports', label: 'Reports', icon: FileBarChart2 },
        { id: 'settings', label: 'Settings', icon: Settings },
      ];

  const renderItem = (item: NavItemConfig) => {
    const Icon = item.icon;
    const isActive = activeRoute === item.id;

    return (
      <button
        key={item.id}
        type="button"
        onClick={() => {
          onNavigate(item.id);
          onCloseMobile();
        }}
        className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-[4px] text-left transition-all duration-150 cursor-pointer border-2 ${
          isActive
            ? 'bg-[#1B1B20] border-[#9A7AF1] text-[#FFFFFF] shadow-[2px_2px_0px_#9A7AF1]'
            : 'bg-transparent border-transparent text-[#94A3B8] hover:text-[#FFFFFF] hover:bg-[#18181C]'
        }`}
      >
        <span className="flex items-center gap-2 min-w-0">
          <Icon
            className={`w-3.5 h-3.5 shrink-0 ${
              isActive ? 'text-[#9A7AF1]' : 'text-[#94A3B8]'
            }`}
          />
          <span className="text-[12px] font-medium whitespace-nowrap truncate">
            {item.label}
          </span>
        </span>
        {typeof item.badge === 'number' && item.badge > 0 && (
          <span
            className={`px-1.5 py-0.5 text-[10px] font-mono font-bold tabular-nums rounded-[3px] shrink-0 border leading-none ${
              item.badgeTone === 'amber'
                ? 'bg-[#F59E0B] text-[#0E0E10] border-[#0E0E10]'
                : 'bg-[#9A7AF1] text-[#FFFFFF] border-[#FFFFFF]/30'
            }`}
          >
            {item.badge}
          </span>
        )}
      </button>
    );
  };

  const sidebarContent = (
    <aside className="w-[224px] h-full bg-[#0E0E10] text-[#FFFFFF] border-r-2 border-[#1E293B] flex flex-col justify-between shrink-0 select-none overflow-hidden">
      <div className="px-3 py-2.5 border-b border-[#1E293B] flex items-center justify-between gap-2 shrink-0">
        <BrandLogo />
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="lg:hidden p-1 text-[#94A3B8] hover:text-[#FFFFFF] border border-[#1E293B] rounded-[4px]"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto audit-scroll px-2.5 py-2.5 space-y-2.5">
        <div>
          <div className="px-2.5 mb-1 text-[9.5px] font-bold uppercase tracking-[0.12em] text-[#64748B]">
            Audit Workspace
          </div>
          <nav className="space-y-1" aria-label="Main navigation">
            {primaryNav.map(renderItem)}
          </nav>
        </div>

        <div className="mx-2 border-t border-[#1E293B]" />

        <div>
          <div className="px-2.5 mb-1 text-[9.5px] font-bold uppercase tracking-[0.12em] text-[#64748B]">
            Outputs & Control
          </div>
          <nav className="space-y-1" aria-label="Secondary navigation">
            {secondaryNav.map(renderItem)}
          </nav>
        </div>
      </div>

      <div className="px-3 py-2.5 border-t border-[#1E293B] shrink-0">
        <div className="flex items-center gap-2 px-1">
          <div className="w-7 h-7 rounded-[4px] bg-[#9A7AF1] border border-[#FFFFFF] flex items-center justify-center font-display text-[11px] font-bold text-[#FFFFFF] shrink-0">
            JA
          </div>
          <div className="min-w-0">
            <div className="text-[11.5px] font-semibold text-[#FFFFFF] truncate leading-tight">
              {accountName}
            </div>
            <div className="text-[10px] text-[#94A3B8] truncate">
              {accountRole}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );

  return (
    <>
      <div className="hidden lg:block h-full shrink-0">{sidebarContent}</div>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-[#0E0E10]/60"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{sidebarContent}</div>
        </div>
      )}
    </>
  );
};
