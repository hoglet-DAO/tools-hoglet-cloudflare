"use client";

import { motion, AnimatePresence } from "framer-motion";

interface FunctionPayloadPreviewProps {
  showPayload: boolean;
  setShowPayload: (val: boolean | ((prev: boolean) => boolean)) => void;
  moduleAddress: string;
  moduleName: string;
  functionName: string;
  genericTypeParams: any[];
  typeParams: { [key: string]: string };
  paramsList: string[];
  functionParams: { [key: string]: string };
}

export function FunctionPayloadPreview({
  showPayload,
  setShowPayload,
  moduleAddress,
  moduleName,
  functionName,
  genericTypeParams,
  typeParams,
  paramsList,
  functionParams,
}: FunctionPayloadPreviewProps) {
  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setShowPayload((prev) => !prev)}
        className="text-xs text-gray-400 hover:text-white flex items-center gap-1.5 transition-colors"
      >
        <svg
          className={`w-3.5 h-3.5 transition-transform ${showPayload ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        {showPayload ? "Hide" : "View"} Raw Payload
      </button>

      <AnimatePresence>
        {showPayload && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mt-3"
          >
            <div className="p-4 bg-zinc-900/80 border border-white/10 rounded-xl text-xs font-mono text-zinc-300 overflow-x-auto whitespace-break-spaces break-all sm:break-normal">
              <div className="text-zinc-500 mb-2">// Payload passed to the wallet/RPC:</div>
              <div>
                <span className="text-pink-400">moduleAddress:</span> "{moduleAddress}"
              </div>
              <div>
                <span className="text-pink-400">moduleName:</span> "{moduleName}"
              </div>
              <div>
                <span className="text-pink-400">functionName:</span> "{functionName}"
              </div>

              <div className="mt-2">
                <span className="text-blue-400">typeArguments:</span> [
              </div>
              {(genericTypeParams || []).map((_: any, idx: number) => (
                <div key={idx} className="pl-4">
                  "{typeParams[idx] || ""}"{idx < genericTypeParams.length - 1 ? "," : ""}
                </div>
              ))}
              <div>]</div>

              <div className="mt-2">
                <span className="text-emerald-400">arguments:</span> [
              </div>
              {paramsList.map((type: string, idx: number) => {
                const rawVal = functionParams[idx] || "";
                let formattedVal = `"${rawVal}"`;
                if (type.startsWith("vector<")) {
                  try {
                    const parsed = JSON.parse(rawVal);
                    formattedVal = JSON.stringify(parsed, null, 2);
                  } catch {
                    formattedVal = `"${rawVal}"`;
                  }
                } else if (type === "bool") {
                  formattedVal = rawVal === "true" ? "true" : rawVal === "false" ? "false" : `"${rawVal}"`;
                } else if (type.startsWith("u") && rawVal && !isNaN(Number(rawVal))) {
                  formattedVal = rawVal;
                }

                return (
                  <div key={idx} className="pl-4">
                    <span className="text-zinc-500 mr-2">/* {type} */</span>
                    {formattedVal}
                    {idx < paramsList.length - 1 ? "," : ""}
                  </div>
                );
              })}
              <div>]</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
