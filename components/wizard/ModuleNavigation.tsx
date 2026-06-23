"use client";


interface ModuleNavigationProps {
  modules: any[];
  selectedModule: any;
  onSelectModule: (mod: any) => void;
  authKey?: string | null;
  contractAddress?: string;
  onOpenModal: () => void;
}

export function ModuleNavigation({
  modules,
  selectedModule,
  onSelectModule,
  authKey,
  contractAddress,
  onOpenModal,
}: ModuleNavigationProps) {
  const isImmutable = authKey === "0x0000000000000000000000000000000000000000000000000000000000000000";
  // The contract is controlled by an external admin/multisig if authKey is not zeros and authKey !== contractAddress
  const isExternalAdmin = !isImmutable && authKey && contractAddress && authKey.toLowerCase() !== contractAddress.toLowerCase();

  return (
    <div className="p-4 border-b border-white/10 bg-black/40 rounded-t-2xl z-10">
      <div className="flex items-center gap-3 mb-3 relative flex-wrap">
        <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
        <span className="text-white font-bold tracking-wide text-sm uppercase">Contract Modules</span>
        
        {/* Tooltip / Info Icon */}
        <div className="group relative flex items-center cursor-help">
          <div className="flex items-center justify-center w-4 h-4 rounded-full border border-gray-500 text-gray-400 hover:text-cyan-400 hover:border-cyan-400 transition-colors">
            <span className="text-[10px] font-bold">?</span>
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 p-3 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl text-xs text-gray-300 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
            In Supra (Move language), a smart contract consists of multiple <strong>Modules</strong>. Each module groups independent view (Read) or state (Write) functions. Select a module to explore its capabilities.
          </div>
        </div>

        {authKey && (
          <div className="ml-auto group relative flex items-center cursor-help">
            <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border flex items-center gap-1 ${
              isImmutable 
                ? "bg-green-500/20 text-green-400 border-green-500/30" 
                : isExternalAdmin 
                  ? "bg-purple-500/20 text-purple-400 border-purple-500/30"
                  : "bg-amber-500/20 text-amber-400 border-amber-500/30"
            }`}>
              {isImmutable ? (
                <>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                  Immutable
                </>
              ) : isExternalAdmin ? (
                <>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                  Admin Rotated
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                  Upgradeable
                </>
              )}
            </span>
            <div className="absolute right-0 bottom-full mb-2 w-64 p-3 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl text-xs text-gray-300 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
              {isImmutable 
                ? "This account has burned its authentication key (0x0). It is fully decentralized and its modules cannot be upgraded." 
                : isExternalAdmin 
                  ? "This contract's authentication key has been rotated to another address. Upgrades are controlled by an external admin or multisig."
                  : "This contract has an active authentication key, meaning the deployer can still upgrade these modules or sign transactions."}
              <div className="mt-2 text-[10px] text-gray-500 break-all font-mono">Auth Key: {authKey}</div>
            </div>
          </div>
        )}
      </div>
      
      <div className="flex items-center gap-2 pb-2">
        <div className="flex-1 flex items-center overflow-x-auto whitespace-nowrap gap-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {modules.map(m => (
            <button
              key={m.name}
              onClick={() => onSelectModule(m)}
              className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-bold transition-all shadow-lg ${
                selectedModule?.name === m.name
                  ? 'bg-gradient-to-r from-amm-red to-amm-pink text-white shadow-amm-red/30'
                  : 'bg-black/60 border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 hover:border-white/20'
              }`}
            >
              {m.name}
            </button>
          ))}
        </div>
        
        {modules.length > 2 && (
          <div className="shrink-0 ml-1 pl-1 border-l border-white/10">
            <button
              onClick={onOpenModal}
              className="whitespace-nowrap px-4 py-2 rounded-full text-sm font-bold transition-all shadow-lg bg-black/60 border border-white/10 text-amm-pink hover:bg-white/5 hover:border-amm-pink/50 flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
              All
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
