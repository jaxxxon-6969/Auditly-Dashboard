import React from 'react';

export const BrandLogo: React.FC = () => {
  return (
    <div className="flex items-center gap-2.5 select-none min-w-0">
      <img
        src="/assets/auditly-dashboard-logo.png"
        alt="AUDITLY logo"
        className="w-10 h-10 object-contain shrink-0"
      />
      <div className="min-w-0">
        <div className="font-display text-[13px] font-bold tracking-tight text-[#FFFFFF] leading-tight whitespace-nowrap">
          AUDITLY
        </div>
        <div className="text-[8px] font-semibold tracking-[0.06em] text-[#94A3B8] uppercase mt-0.5 leading-tight whitespace-nowrap">
          Payroll Contribution Audit
        </div>
      </div>
    </div>
  );
};
