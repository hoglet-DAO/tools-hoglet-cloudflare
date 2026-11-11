"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FunctionInputs } from "./FunctionInputs";
import { FunctionPayloadPreview } from "./FunctionPayloadPreview";
import { FunctionResultConsole } from "./FunctionResultConsole";
import { extractModuleDetails, generateFunctionAbiForAI } from "./functionAbiExport";

interface FunctionFormProps {
  selectedFunction: any;
  selectedModule: any;
  contractAddress?: string;
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
  contractAddress,
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
  const [exportCopied, setExportCopied] = useState(false);
  const [showPayload, setShowPayload] = useState(false);

  const { modAddr, modName } = extractModuleDetails(selectedModule, contractAddress);

  const handleExportForAI = () => {
    const exportData = generateFunctionAbiForAI(selectedModule, selectedFunction, contractAddress);
    if (!exportData) return;

    navigator.clipboard.writeText(JSON.stringify(exportData, null, 2));
    setExportCopied(true);
    setTimeout(() => setExportCopied(false), 2000);
  };

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
              <svg className="w-8 h-8 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Select a function</h3>
            <p className="text-gray-500 max-w-sm">
              Explore the functions in the left panel to view their details and execute them.
            </p>
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  const paramsList = (selectedFunction.params || []).filter((p: string) => p !== "&signer");
  const isInternal = !selectedFunction.is_entry && !selectedFunction.is_view;

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
            <div
              className={`absolute top-0 left-0 w-full h-1 ${
                isInternal
                  ? "bg-zinc-600"
                  : selectedFunction.is_view
                  ? "bg-gradient-to-r from-cyan-400 to-blue-600"
                  : "bg-gradient-to-r from-amm-red to-amm-pink"
              }`}
            />

            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-2">
              <h3 className="text-xl font-bold text-white flex flex-wrap items-center gap-2">
                {selectedFunction.name}
                {isInternal ? (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800/50 text-zinc-400 border border-zinc-600/50 tracking-wider">
                    INTERNAL
                  </span>
                ) : selectedFunction.is_view ? (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 tracking-wider">
                    VIEW
                  </span>
                ) : (
                  <div className="relative group">
                    <span className="text-[10px] px-2 py-0.5 rounded bg-amm-red/20 text-amm-pink border border-amm-pink/30 tracking-wider flex items-center gap-1 cursor-help">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                      </svg>
                      ENTRY
                    </span>
                    <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-48 p-2 bg-zinc-900 border border-zinc-700 text-[10px] text-zinc-300 rounded shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all pointer-events-none z-10 text-center leading-tight">
                      State-changing function: This action will trigger a wallet signature and consume network gas.
                      <div className="absolute left-1/2 -translate-x-1/2 top-full border-4 border-transparent border-t-zinc-900" />
                    </div>
                  </div>
                )}
              </h3>

              <button
                type="button"
                onClick={handleExportForAI}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all shrink-0 border ${
                  exportCopied
                    ? "bg-green-500/20 text-green-400 border-green-500/30"
                    : "bg-indigo-500/10 text-indigo-400 border-indigo-500/20 hover:bg-indigo-500/20 hover:border-indigo-500/40 hover:shadow-[0_0_15px_rgba(99,102,241,0.15)]"
                }`}
                title="Copy structured ABI for AI Agents"
              >
                {exportCopied ? (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Copied JSON!
                  </>
                ) : (
                  <>
                    <span className="text-sm">🤖</span> Export for AI
                  </>
                )}
              </button>
            </div>

            <p className="text-sm text-gray-400 mb-6 font-mono">
              Module: {selectedModule?.name}
            </p>

            {/* Internal Function Warning */}
            {isInternal && (
              <div className="mb-6 p-4 rounded-xl bg-zinc-900/80 border border-zinc-700/50 text-sm text-zinc-400 flex items-start gap-3">
                <svg className="w-5 h-5 text-zinc-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p>
                  <strong>Internal Function:</strong> This is a standard <code>public fun</code>. It is not marked as <code>entry</code> or <code>#[view]</code>. It can only be invoked on-chain by other smart contracts. Direct execution from the interactor is disabled.
                </p>
              </div>
            )}

            {/* Inputs: Generics and Arguments */}
            <FunctionInputs
              selectedFunction={selectedFunction}
              paramsList={paramsList}
              typeParams={typeParams}
              setTypeParams={setTypeParams}
              functionParams={functionParams}
              setFunctionParams={setFunctionParams}
            />

            {/* Action Section */}
            {isInternal ? (
              <div className="mt-8 text-center text-sm text-zinc-500 italic p-4 bg-zinc-900/50 rounded-xl border border-zinc-800">
                This function is internal and cannot be executed directly from the interactor.
              </div>
            ) : (
              <div className="flex flex-col gap-4 mt-8">
                {/* Dry Run / View Payload Feature */}
                <FunctionPayloadPreview
                  showPayload={showPayload}
                  setShowPayload={setShowPayload}
                  moduleAddress={modAddr}
                  moduleName={modName}
                  functionName={selectedFunction.name}
                  genericTypeParams={selectedFunction.generic_type_params || []}
                  typeParams={typeParams}
                  paramsList={paramsList}
                  functionParams={functionParams}
                />

                {!isConnected && !selectedFunction.is_view ? (
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
                        ? "bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:-translate-y-0.5"
                        : "bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-400 hover:to-pink-500 shadow-[0_0_20px_rgba(244,63,94,0.4)] hover:-translate-y-0.5"
                    }`}
                  >
                    {isDeploying ? (
                      <div className="flex items-center justify-center gap-3">
                        <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        Executing...
                      </div>
                    ) : selectedFunction.is_view ? (
                      "Query"
                    ) : (
                      "Run"
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
            <FunctionResultConsole result={result} error={error} />
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
