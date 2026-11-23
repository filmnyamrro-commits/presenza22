import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import type { DiagnosticErrorDetails } from '../types';

interface DiagnosticErrorPanelProps {
  diagnostic: DiagnosticErrorDetails;
  defaultOpen?: boolean;
}

export default function DiagnosticErrorPanel({
  diagnostic,
  defaultOpen = false,
}: DiagnosticErrorPanelProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mt-2.5 rounded-lg border border-rose-200/80 bg-white/80 text-left text-xs text-slate-700 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full px-3 py-2 flex items-center justify-between gap-2 font-semibold text-rose-900 hover:bg-rose-50/70 transition-colors"
      >
        <span className="inline-flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
          <span>Error Diagnostics ({diagnostic.component})</span>
        </span>
        {open ? (
          <ChevronUp className="w-3.5 h-3.5 shrink-0" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 shrink-0" />
        )}
      </button>

      {open && (
        <dl className="px-3 pb-3 pt-1 border-t border-rose-100 space-y-1.5 font-mono-tabular text-[11px] break-all">
          <div>
            <dt className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">
              Failing URL
            </dt>
            <dd className="text-slate-900">{diagnostic.failingUrl}</dd>
          </div>
          {typeof diagnostic.httpStatus === 'number' && (
            <div>
              <dt className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">
                HTTP Status
              </dt>
              <dd className="text-slate-900">{diagnostic.httpStatus}</dd>
            </div>
          )}
          {(diagnostic.firebaseCode || diagnostic.firebaseMessage) && (
            <div>
              <dt className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">
                Firebase Error
              </dt>
              <dd className="text-rose-800">
                {diagnostic.firebaseCode ? `[${diagnostic.firebaseCode}] ` : ''}
                {diagnostic.firebaseMessage || ''}
              </dd>
            </div>
          )}
          {diagnostic.consoleError && (
            <div>
              <dt className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">
                Console Error
              </dt>
              <dd className="text-slate-800">{diagnostic.consoleError}</dd>
            </div>
          )}
          <div>
            <dt className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">
              Responsible Component / Function
            </dt>
            <dd className="text-slate-900">{diagnostic.component}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}
