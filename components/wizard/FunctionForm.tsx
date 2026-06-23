"use client";

import { motion, AnimatePresence } from "framer-motion";
import { getSmartPlaceholder } from "@/utils/moveParser";
import { VectorInput } from "./VectorInput";

interface FunctionFormProps {
  selectedFunction: any;
  selectedModule: any;
  isConnected: boolean;
  onConnect: () => void;
  functionParams: { [key: string]: string };
  setFunctionParams: (params: { [key: string]: string }) => void;
  typeParams: { [key: string]: string };
  setTypeParams: (params: { [key: string]: string }) => void;
  isDeploying: boolean;
  isReadyToExecute: boolean;
  handleExecute: () => void;
  result: any;
  error: string | null;
}

export function FunctionForm({
  selectedFunction,
  selectedModule,
  isConnected,
  onConnect,
  functionParams,
  setFunctionParams,
  typeParams,
  setTypeParams,
  isDeploying,
  isReadyToExecute,
  handleExecute,
  result,
  error,
}: FunctionFormProps) {
  if (!selectedFunction) {
    return (
      <div className="lg:w-7/12 xl:w-2/3 flex-1 w-full">
        <AnimatePresence mode="wait">
          <motion.div
            key="empty-state"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-6 lg:mt-0 flex flex-col items-center justify-center h-full min-h-[400px] bg-black/20 border border-white/5 rounded-2xl text-center p-8"
          >
            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4 border border-white/10">
              <svg className="w-8 h-8 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Select a function</h3>
            <p className="text-gray-500 max-w-sm">Explore the functions in the left panel to view their details and execute them.</p>
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  const paramsList = (selectedFunction.params || []).filter((p: string) => p !== '&signer');

  return (
    <div className="lg:w-7/12 xl:w-2/3 flex-1 w-full">
      <AnimatePresence mode="wait">
        <motion.div
          key={selectedFunction.name}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="mt-6 lg:mt-0"
        >
          <div className="bg-black/60 border border-white/10 rounded-xl p-6 shadow-xl relative overflow-hidden">
            {/* Decorative glow */}
            <div className={`absolute top-0 left-0 w-full h-1 ${!selectedFunction.is_entry && !selectedFunction.is_view ? 'bg-zinc-600' : (selectedFunction.is_view ? 'bg-gradient-to-r from-cyan-400 to-blue-600' : 'bg-gradient-to-r from-amm-red to-amm-pink')}`} />
            
            <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              {selectedFunction.name}
              {!selectedFunction.is_entry && !selectedFunction.is_view ? (
                <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800/50 text-zinc-400 border border-zinc-600/50 tracking-wider">INTERNAL</span>
              ) : selectedFunction.is_view ? (
                <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 tracking-wider">VIEW</span>
              ) : (
                <div className="relative group">
                  <span className="text-[10px] px-2 py-0.5 rounded bg-amm-red/20 text-amm-pink border border-amm-pink/30 tracking-wider flex items-center gap-1 cursor-help">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" /></svg>
                    ENTRY
                  </span>
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-48 p-2 bg-zinc-900 border border-zinc-700 text-[10px] text-zinc-300 rounded shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all pointer-events-none z-10 text-center leading-tight">
                    State-changing function: This action will trigger a wallet signature and consume network gas.
                    <div className="absolute left-1/2 -translate-x-1/2 top-full border-4 border-transparent border-t-zinc-900" />
                  </div>
                </div>
              )}
            </h3>
            <p className="text-sm text-gray-400 mb-6 font-mono">
              Module: {selectedModule?.name}
            </p>

            {/* Internal Function Warning */}
            {!selectedFunction.is_entry && !selectedFunction.is_view && (
              <div className="mb-6 p-4 rounded-xl bg-zinc-900/80 border border-zinc-700/50 text-sm text-zinc-400 flex items-start gap-3">
                <svg className="w-5 h-5 text-zinc-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <p>
                  <strong>Internal Function:</strong> This is a standard <code>public fun</code>. It is not marked as <code>entry</code> or <code>#[view]</code>. It can only be invoked on-chain by other smart contracts. Direct execution from the interactor is disabled.
                </p>
              </div>
            )}

            {/* Type Arguments */}
            {selectedFunction.generic_type_params && selectedFunction.generic_type_params.length > 0 && (
              <div className="mb-6 p-4 rounded-xl bg-blue-900/10 border border-blue-500/20">
                <div className="flex items-center gap-2 mb-4">
                  <h4 className="text-sm font-bold text-blue-400 uppercase tracking-wide">Type Arguments (Generics)</h4>
                  <div className="group relative flex items-center cursor-help">
                    <div className="flex items-center justify-center w-4 h-4 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/50">
                      <span className="text-[10px] font-bold">i</span>
                    </div>
                    <div className="absolute left-0 bottom-full mb-2 w-64 p-3 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl text-xs text-gray-300 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                      Type Arguments specify the structural types required by this generic function. Enter the full type address, for example: <code>0x1::supra_coin::SupraCoin</code>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  {selectedFunction.generic_type_params.map((_: any, idx: number) => (
                    <div key={`type-${idx}`} className="group">
                    <label className="block text-xs font-semibold text-gray-400 mb-1 group-focus-within:text-white transition-colors">
                      Type Arg {idx} (e.g., 0x1::supra_coin::SupraCoin)
                    </label>
                    <input 
                      type="text" 
                      disabled={!selectedFunction.is_entry && !selectedFunction.is_view}
                      className={`w-full bg-black border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed ${!selectedFunction.is_entry && !selectedFunction.is_view ? 'focus:border-zinc-500' : (selectedFunction.is_view ? 'focus:border-cyan-400/50 focus:shadow-[0_0_15px_rgba(6,182,212,0.2)]' : 'focus:border-amm-pink/50 focus:shadow-[0_0_15px_rgba(255,107,107,0.2)]')}`}
                      placeholder={getSmartPlaceholder(selectedFunction.generic_type_params[idx] || "address")}
                      value={typeParams[idx] || ""}
                      onChange={(e) => setTypeParams({...typeParams, [idx]: e.target.value})}
                    />
                  </div>
                ))}
                </div>
              </div>
            )}

            {/* Form Inputs */}
            {paramsList.length > 0 ? (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-4">
                  <h4 className="text-sm font-bold text-gray-300 uppercase tracking-wide flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                    Function Arguments
                  </h4>
                  <div className="group relative flex items-center cursor-help">
                    <div className="flex items-center justify-center w-4 h-4 rounded-full bg-gray-500/20 text-gray-400 border border-gray-500/50">
                      <span className="text-[10px] font-bold">i</span>
                    </div>
                    <div className="absolute left-0 bottom-full mb-2 w-64 p-3 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl text-xs text-gray-300 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                      Enter the actual values (amounts, addresses, booleans) to pass into the function.
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  {paramsList.map((paramType: string, idx: number) => (
                    <div key={idx} className="group">
                    <label className="block text-xs font-semibold text-gray-400 mb-1 group-focus-within:text-white transition-colors">
                      arg{idx} ({paramType})
                    </label>
                    {paramType.startsWith("vector<") ? (
                      <VectorInput 
                        value={functionParams[idx] || ""}
                        onChange={(val) => setFunctionParams({...functionParams, [idx]: val})}
                        disabled={!selectedFunction.is_entry && !selectedFunction.is_view}
                        focusColorClass={!selectedFunction.is_entry && !selectedFunction.is_view ? 'focus-within:border-zinc-500' : (selectedFunction.is_view ? 'focus-within:border-cyan-400/50 focus-within:shadow-[0_0_15px_rgba(6,182,212,0.2)]' : 'focus-within:border-amm-pink/50 focus-within:shadow-[0_0_15px_rgba(255,107,107,0.2)]')}
                        paramType={paramType}
                      />
                    ) : paramType === "bool" ? (
                      <div className={`flex w-full bg-black/60 border border-white/10 rounded-lg p-1 ${!selectedFunction.is_entry && !selectedFunction.is_view ? 'opacity-50 pointer-events-none' : ''}`}>
                        <button 
                          type="button"
                          onClick={() => setFunctionParams({...functionParams, [idx]: "true"})}
                          className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${functionParams[idx] === "true" ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-400/50 shadow-[0_0_10px_rgba(6,182,212,0.2)]' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                          True
                        </button>
                        <button 
                          type="button"
                          onClick={() => setFunctionParams({...functionParams, [idx]: "false"})}
                          className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${functionParams[idx] === "false" ? 'bg-amm-red/20 text-amm-pink border border-amm-pink/50 shadow-[0_0_10px_rgba(255,107,107,0.2)]' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                          False
                        </button>
                      </div>
                    ) : (
                      <input 
                        type="text" 
                        disabled={!selectedFunction.is_entry && !selectedFunction.is_view}
                        className={`w-full bg-black border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed ${!selectedFunction.is_entry && !selectedFunction.is_view ? 'focus:border-zinc-500' : (selectedFunction.is_view ? 'focus:border-cyan-400/50 focus:shadow-[0_0_15px_rgba(6,182,212,0.2)]' : 'focus:border-amm-pink/50 focus:shadow-[0_0_15px_rgba(255,107,107,0.2)]')}`}
                        placeholder={getSmartPlaceholder(paramType)}
                        value={functionParams[idx] || ""}
                        onChange={(e) => setFunctionParams({...functionParams, [idx]: e.target.value})}
                      />
                    )}
                  </div>
                ))}
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-500 italic mb-6">
                This function requires no arguments.
              </div>
            )}

            {/* Action Button */}
            {(!selectedFunction.is_entry && !selectedFunction.is_view) ? (
              <div className="mt-8 text-center text-sm text-zinc-500 italic p-4 bg-zinc-900/50 rounded-xl border border-zinc-800">
                This function is internal and cannot be executed directly from the interactor.
              </div>
            ) : (
              <div className="flex flex-col gap-4 mt-8">
                {(!isConnected && !selectedFunction.is_view) ? (
                  <button 
                    onClick={onConnect}
                    className="w-full py-4 rounded-xl text-lg font-black tracking-widest uppercase transition-all shadow-xl text-white bg-gradient-to-r from-amm-red to-amm-pink hover:from-rose-500 hover:to-pink-600 shadow-[0_0_20px_rgba(244,63,94,0.4)] hover:-translate-y-0.5"
                  >
                    Connect Wallet to Execute
                  </button>
                ) : (
                  <button 
                    onClick={handleExecute}
                    disabled={isDeploying || !isReadyToExecute}
                    className={`w-full py-4 rounded-xl text-lg font-black tracking-widest uppercase transition-all shadow-xl text-white disabled:opacity-50 disabled:cursor-not-allowed ${
                      selectedFunction.is_view 
                        ? 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:-translate-y-0.5'
                        : 'bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-400 hover:to-pink-500 shadow-[0_0_20px_rgba(244,63,94,0.4)] hover:-translate-y-0.5'
                    }`}
                  >
                    {isDeploying ? (
                      <div className="flex items-center justify-center gap-3">
                        <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        Executing...
                      </div>
                    ) : (
                      selectedFunction.is_view ? "Query" : "Run"
                    )}
                  </button>
                )}
                {!isConnected && !selectedFunction.is_view && (
                  <span className="text-xs text-amm-pink font-semibold border border-amm-pink/30 bg-amm-red/10 px-3 py-1.5 rounded-lg text-center">
                    Wallet connection is required to interact with on-chain state.
                  </span>
                )}
              </div>
            )}

            {/* Terminal Result Console */}
            <AnimatePresence>
              {(result || error) && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`mt-6 rounded-lg overflow-hidden border ${error ? 'border-amm-pink/50' : 'border-green-500/30'}`}
                >
                  <div className={`px-4 py-2 text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${error ? 'bg-amm-red/20 text-amm-pink' : 'bg-green-500/20 text-green-400'}`}>
                    {error ? 'Error / Execution Failed' : 'Success / Response'}
                  </div>
                  <pre className="p-4 bg-black text-sm text-gray-200 overflow-x-auto font-mono whitespace-pre-wrap max-h-[300px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/20">
                    {error ? error : (typeof result === 'string' ? result : JSON.stringify(result, null, 2))}
                  </pre>
                </motion.div>
              )}
            </AnimatePresence>

          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
