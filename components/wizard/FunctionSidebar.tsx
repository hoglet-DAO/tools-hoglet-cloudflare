"use client";

interface FunctionSidebarProps {
  functions: any[];
  selectedFunction: any;
  onSelectFunction: (func: any) => void;
  selectedModule: any;
}

export function FunctionSidebar({
  functions,
  selectedFunction,
  onSelectFunction,
  selectedModule,
}: FunctionSidebarProps) {
  if (functions.length === 0) {
    return (
      <div className="lg:w-5/12 xl:w-1/3 shrink-0 w-full">
        <div className="py-10 text-center text-gray-500 italic bg-black/20 rounded-xl border border-white/5 mb-6 lg:mb-0">
          No functions found in module "{selectedModule?.name}".
        </div>
      </div>
    );
  }

  const entryFunctions = functions.filter(f => f.is_entry);
  const viewFunctions = functions.filter(f => f.is_view);
  const internalFunctions = functions.filter(f => !f.is_entry && !f.is_view);

  const renderGrid = (funcs: any[], type: 'entry' | 'view' | 'internal') => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
    {funcs.map((func) => {
      const isSelected = selectedFunction?.name === func.name;
      const isView = func.is_view;
      const isInternal = type === 'internal';

      let btnClass = '';
      let badgeClass = '';
      let badgeText = '';

      if (isInternal) {
        btnClass = isSelected 
          ? 'bg-zinc-800/80 border-zinc-500/50 text-zinc-300 shadow-[0_0_15px_rgba(161,161,170,0.2)]'
          : 'bg-black/40 border-white/5 border-l-[3px] border-l-zinc-600 text-gray-500 hover:bg-white/5 hover:border-white/20 hover:border-l-zinc-500';
        badgeClass = 'bg-zinc-800/50 text-zinc-400 border border-zinc-600/50';
        badgeText = 'INTERNAL';
      } else if (isView) {
        btnClass = isSelected 
          ? 'bg-gradient-to-r from-cyan-900/50 to-transparent border-cyan-400/50 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.2)]'
          : 'bg-black/40 border-white/5 border-l-[3px] border-l-cyan-600 text-gray-300 hover:bg-white/5 hover:border-white/20 hover:border-l-cyan-400';
        badgeClass = 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30';
        badgeText = 'VIEW';
      } else {
        btnClass = isSelected
          ? 'bg-gradient-to-r from-amm-red/30 to-transparent border-amm-pink/50 text-amm-pink shadow-[0_0_15px_rgba(221,20,56,0.2)]'
          : 'bg-black/40 border-white/5 border-l-[3px] border-l-amm-red text-gray-300 hover:bg-white/5 hover:border-white/20 hover:border-l-amm-pink';
        badgeClass = 'bg-amm-red/20 text-amm-pink border border-amm-pink/30';
        badgeText = 'ENTRY';
      }

      return (
        <button
          key={func.name}
          onClick={() => onSelectFunction(func)}
          className={`p-3 flex items-center justify-between text-left rounded-xl border transition-all text-sm font-bold shadow-md hover:-translate-y-0.5 ${btnClass}`}
          title={func.name}
        >
          <span className="truncate mr-2">{func.name}</span>
          <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded font-black tracking-wider ${badgeClass}`}>
            {badgeText}
          </span>
        </button>
      );
    })}
  </div>
  );

  return (
    <div className="lg:w-5/12 xl:w-1/3 shrink-0 w-full">
      <div className="mb-6 lg:mb-0 max-h-[350px] lg:max-h-[600px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent space-y-6">
        {entryFunctions.length > 0 && (
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-amm-pink mb-3 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amm-pink shadow-[0_0_8px_rgba(255,107,107,0.8)]" />
              Write Functions (Entry)
            </h4>
            {renderGrid(entryFunctions, 'entry')}
          </div>
        )}
        {viewFunctions.length > 0 && (
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400 mb-3 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
              Read Functions (View)
            </h4>
            {renderGrid(viewFunctions, 'view')}
          </div>
        )}
        {internalFunctions.length > 0 && (
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-3 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
              Internal Functions (Public)
            </h4>
            {renderGrid(internalFunctions, 'internal')}
          </div>
        )}
      </div>
    </div>
  );
}
