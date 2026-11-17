import React from 'react';
import {
  CheckSquare,
  AlertTriangle,
  XCircle,
  FileWarning,
  HelpCircle,
} from 'lucide-react';
import { VerificationStatus } from '../types/audit';

interface StatusTagProps {
  status: VerificationStatus;
  compact?: boolean;
}

export const StatusTag: React.FC<StatusTagProps> = ({ status, compact = false }) => {
  const padding = compact ? 'px-1.5 py-0.5 text-[9.5px]' : 'px-2 py-0.5 text-[11px]';
  const iconSize = compact ? 'w-2.5 h-2.5' : 'w-3 h-3';

  switch (status) {
    case 'Matched':
      return (
        <span
          className={`inline-flex items-center gap-1 ${padding} rounded-[3px] border border-[#10B981] bg-[#E6F8F0] text-[#0F172A] font-semibold uppercase tracking-wide whitespace-nowrap shrink-0`}
        >
          <CheckSquare className={`${iconSize} text-[#10B981] shrink-0`} />
          <span>Matched</span>
        </span>
      );
    case 'Mismatch':
      return (
        <span
          className={`inline-flex items-center gap-1 ${padding} rounded-[3px] border border-[#F43F5E] bg-[#F43F5E]/10 text-[#0F172A] font-semibold uppercase tracking-wide whitespace-nowrap shrink-0`}
        >
          <XCircle className={`${iconSize} text-[#F43F5E] shrink-0`} />
          <span>Mismatch</span>
        </span>
      );
    case 'Missing Record':
      return (
        <span
          className={`inline-flex items-center gap-1 ${padding} rounded-[3px] border border-[#F43F5E] bg-[#F43F5E]/12 text-[#0F172A] font-semibold uppercase tracking-wide whitespace-nowrap shrink-0`}
        >
          <FileWarning className={`${iconSize} text-[#F43F5E] shrink-0`} />
          <span>Missing</span>
        </span>
      );
    case 'Blank IP':
      return (
        <span
          className={`inline-flex items-center gap-1 ${padding} rounded-[3px] border border-[#F59E0B] bg-[#F59E0B]/15 text-[#0F172A] font-semibold uppercase tracking-wide whitespace-nowrap shrink-0`}
        >
          <AlertTriangle className={`${iconSize} text-[#F59E0B] shrink-0`} />
          <span>Blank IP</span>
        </span>
      );
    case 'Needs Review':
    default:
      return (
        <span
          className={`inline-flex items-center gap-1 ${padding} rounded-[3px] border border-[#F59E0B] bg-[#F59E0B]/15 text-[#0F172A] font-semibold uppercase tracking-wide whitespace-nowrap shrink-0`}
        >
          <HelpCircle className={`${iconSize} text-[#F59E0B] shrink-0`} />
          <span>Needs Review</span>
        </span>
      );
  }
};
