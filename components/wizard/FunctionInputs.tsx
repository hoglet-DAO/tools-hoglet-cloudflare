"use client";

import { getSmartPlaceholder } from "@/utils/moveParser";
import { ZERO_AUTH_KEY } from "@snabur/hoglet-frontend/supra";
import { VectorInput } from "./VectorInput";

interface FunctionInputsProps {
  selectedFunction: any;
  paramsList: string[];
  typeParams: { [key: string]: string };
  setTypeParams: (params: { [key: string]: string }) => void;
  functionParams: { [key: string]: string };
  setFunctionParams: (params: { [key: string]: string }) => void;
}

export function FunctionInputs({
  selectedFunction,
  paramsList,
  typeParams,
  setTypeParams,
  functionParams,
  setFunctionParams,
}: FunctionInputsProps) {
  const isExecutable = selectedFunction.is_entry || selectedFunction.is_view;
  const isView = selectedFunction.is_view;

  const focusClass = !isExecutable
    ? "focus:border-zinc-500"
    : isView
    ? "focus:border-cyan-400/50 focus:shadow-[0_0_15px_rgba(6,182,212,0.2)]"
    : "focus:border-amm-pink/50 focus:shadow-[0_0_15px_rgba(255,107,107,0.2)]";

  const vectorFocusClass = !isExecutable
    ? "focus-within:border-zinc-500"
    : isView
    ? "focus-within:border-cyan-400/50 focus-within:shadow-[0_0_15px_rgba(6,182,212,0.2)]"
    : "focus-within:border-amm-pink/50 focus-within:shadow-[0_0_15px_rgba(255,107,107,0.2)]";

  return (
    <>
      {/* Type Arguments (Generics) */}
      {selectedFunction.generic_type_params && selectedFunction.generic_type_params.length > 0 && (
        <div className="mb-6 p-4 rounded-xl bg-blue-900/10 border border-blue-500/20">
          <div className="flex items-center gap-2 mb-4">
            <h4 className="text-sm font-bold text-blue-400 uppercase tracking-wide">
              Type Arguments (Generics)
            </h4>
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
                <label className="flex flex-wrap items-center gap-2 text-xs font-semibold text-gray-400 mb-2 group-focus-within:text-white transition-colors">
                  <span className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded bg-zinc-800/80 text-zinc-300 border border-zinc-700 shadow-inner">
                      Type Arg {idx}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono tracking-tight shadow-[0_0_10px_rgba(59,130,246,0.1)]">
                      Generic Type
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setTypeParams({ ...typeParams, [idx]: "0x1::supra_coin::SupraCoin" })}
                    className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 hover:border-amber-500/40 transition-all text-[10px] flex items-center gap-1 cursor-pointer font-normal whitespace-nowrap shadow-[0_0_10px_rgba(245,158,11,0.1)]"
                    title="Click to auto-fill SupraCoin type"
                  >
                    <span className="opacity-70 font-bold">✨ Example:</span> 0x1::supra_coin::SupraCoin
                  </button>
                </label>
                <input
                  type="text"
                  disabled={!isExecutable}
                  className={`w-full bg-black border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed ${focusClass}`}
                  placeholder={getSmartPlaceholder(selectedFunction.generic_type_params[idx] || "address")}
                  value={typeParams[idx] || ""}
                  onChange={(e) => setTypeParams({ ...typeParams, [idx]: e.target.value })}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Function Arguments */}
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
                <label className="flex flex-wrap items-center gap-2 text-xs font-semibold text-gray-400 mb-2 group-focus-within:text-white transition-colors">
                  <span className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded bg-zinc-800/80 text-zinc-300 border border-zinc-700 shadow-inner">
                      arg{idx}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 font-mono tracking-tight shadow-[0_0_10px_rgba(168,85,247,0.1)]">
                      {paramType}
                    </span>
                  </span>
                  {(paramType === "0x1::string::String" || paramType === "vector<0x1::string::String>") && (
                    <button
                      type="button"
                      onClick={() => setFunctionParams({ ...functionParams, [idx]: "0x1::supra_coin::SupraCoin" })}
                      className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 hover:border-amber-500/40 transition-all text-[10px] flex items-center gap-1 cursor-pointer font-normal whitespace-nowrap shadow-[0_0_10px_rgba(245,158,11,0.1)]"
                      title="Click to auto-fill SupraCoin type string"
                    >
                      <span className="opacity-70 font-bold">✨ Example:</span> 0x1::supra_coin::SupraCoin
                    </button>
                  )}
                  {(paramType === "0x1::object::Object<0x1::fungible_asset::Metadata>" ||
                    paramType === "0x1::object::Object<0x1::object::ObjectCore>") && (
                    <button
                      type="button"
                      onClick={() => setFunctionParams({ ...functionParams, [idx]: "0xa" })}
                      className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 border border-cyan-500/20 hover:border-cyan-500/40 transition-all text-[10px] flex items-center gap-1 cursor-pointer font-normal whitespace-nowrap shadow-[0_0_10px_rgba(6,182,212,0.1)]"
                      title="Click to auto-fill Supra Native FA (0xa)"
                    >
                      <span className="opacity-70 font-bold">✨ Supra FA:</span> 0xa
                    </button>
                  )}
                  {paramType === "vector<u8>" && (
                    <button
                      type="button"
                      onClick={() => setFunctionParams({ ...functionParams, [idx]: ZERO_AUTH_KEY })}
                      className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 hover:border-rose-500/40 transition-all text-[10px] flex items-center gap-1 cursor-pointer font-normal whitespace-nowrap shadow-[0_0_10px_rgba(244,63,94,0.1)]"
                      title="Auto-fill the 32-byte ZERO_AUTH_KEY — the value that burns a key"
                    >
                      <span className="opacity-70 font-bold">✨ ZERO_AUTH_KEY:</span> burn the key
                    </button>
                  )}
                </label>
                {paramType === "vector<u8>" ? (
                  <input
                    type="text"
                    disabled={!isExecutable}
                    className={`w-full bg-black border border-white/10 rounded-lg px-4 py-3 font-mono text-sm text-white focus:outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed ${focusClass}`}
                    placeholder={`0x… (hex bytes, e.g. ${ZERO_AUTH_KEY})`}
                    value={functionParams[idx] || ""}
                    onChange={(e) => setFunctionParams({ ...functionParams, [idx]: e.target.value })}
                  />
                ) : paramType.startsWith("vector<") ? (
                  <VectorInput
                    value={functionParams[idx] || ""}
                    onChange={(val) => setFunctionParams({ ...functionParams, [idx]: val })}
                    disabled={!isExecutable}
                    focusColorClass={vectorFocusClass}
                    paramType={paramType}
                  />
                ) : paramType === "bool" ? (
                  <div
                    className={`flex w-full bg-black/60 border border-white/10 rounded-lg p-1 ${
                      !isExecutable ? "opacity-50 pointer-events-none" : ""
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setFunctionParams({ ...functionParams, [idx]: "true" })}
                      className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${
                        functionParams[idx] === "true"
                          ? "bg-cyan-500/20 text-cyan-400 border border-cyan-400/50 shadow-[0_0_10px_rgba(6,182,212,0.2)]"
                          : "text-gray-500 hover:text-gray-300"
                      }`}
                    >
                      True
                    </button>
                    <button
                      type="button"
                      onClick={() => setFunctionParams({ ...functionParams, [idx]: "false" })}
                      className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${
                        functionParams[idx] === "false"
                          ? "bg-amm-red/20 text-amm-pink border border-amm-pink/50 shadow-[0_0_10px_rgba(255,107,107,0.2)]"
                          : "text-gray-500 hover:text-gray-300"
                      }`}
                    >
                      False
                    </button>
                  </div>
                ) : (
                  <input
                    type="text"
                    disabled={!isExecutable}
                    className={`w-full bg-black border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed ${focusClass}`}
                    placeholder={getSmartPlaceholder(paramType)}
                    value={functionParams[idx] || ""}
                    onChange={(e) => setFunctionParams({ ...functionParams, [idx]: e.target.value })}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-sm text-gray-500 italic mb-6">This function requires no arguments.</div>
      )}
    </>
  );
}
