"use client";

import React, { useState } from "react";
import { Plus, Trash2, Play, Loader2, CheckCircle2, AlertCircle, ExternalLink, Terminal, Code } from "lucide-react";
import { ScriptArgInput, sendScriptTransaction } from "@/utils/supra/scriptExecutor";
import { useSupraWallet } from "@/context/SupraWalletContext";
import { useNetwork } from "@/context/NetworkContext";
import { getExplorerUrl } from "@/utils/supra/explorerUtils";
import { Form, Field, inputCls } from "@/components/governance/lifecycle/LifecycleShared";
import { formatBytes } from "@/lib/governance/buildArtifacts";

export function ScriptRunner({
  scriptBytecodeHex,
  scriptName,
}: {
  scriptBytecodeHex: string;
  scriptName: string;
}) {
  const { provider, accounts, rpcUrl, signRawHex } = useSupraWallet();
  const { network } = useNetwork();
  const activeAccount = accounts?.[0] || "";

  const [typeArgs, setTypeArgs] = useState<string[]>([]);
  const [args, setArgs] = useState<ScriptArgInput[]>([]);
  const [executing, setExecuting] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const addTypeArg = () => setTypeArgs([...typeArgs, ""]);
  const updateTypeArg = (idx: number, val: string) => {
    const updated = [...typeArgs];
    updated[idx] = val;
    setTypeArgs(updated);
  };
  const removeTypeArg = (idx: number) => {
    setTypeArgs(typeArgs.filter((_, i) => i !== idx));
  };

  const addArg = () => {
    setArgs([
      ...args,
      { id: Math.random().toString(36).substring(7), type: "u64", value: "" },
    ]);
  };
  const updateArg = (id: string, field: "type" | "value", val: string) => {
    setArgs(
      args.map((a) => (a.id === id ? { ...a, [field]: val } : a))
    );
  };
  const removeArg = (id: string) => {
    setArgs(args.filter((a) => a.id !== id));
  };

  const handleExecute = async () => {
    if (!activeAccount || !provider) {
      setError("Please connect your wallet first.");
      return;
    }
    setExecuting(true);
    setError(null);
    setTxHash(null);

    try {
      const hash = await sendScriptTransaction({
        provider,
        signRawHex,
        account: activeAccount,
        rpcUrl,
        scriptBytecodeHex,
        typeArgs,
        args,
      });
      setTxHash(hash);
    } catch (e: any) {
      console.error("Script execution failed:", e);
      setError(e?.message || String(e));
    } finally {
      setExecuting(false);
    }
  };

  const byteLength = scriptBytecodeHex ? (scriptBytecodeHex.startsWith("0x") ? (scriptBytecodeHex.length - 2) / 2 : scriptBytecodeHex.length / 2) : 0;

  return (
    <div className="mt-4">
      <Form
        title="Execute Move Script"
        hint="Invoke this transient compiled bytecode script directly through your connected wallet."
        ready={!!activeAccount && !!scriptBytecodeHex}
        pending={executing}
        cta="Execute Script Transaction"
        reason={!activeAccount ? "Connect a wallet to execute" : undefined}
        hideCta={!activeAccount}
        onSubmit={handleExecute}
      >
        {/* Script Artifact Overview Chip */}
        <div className="flex items-center justify-between gap-3 rounded-xl border border-purple-500/30 bg-purple-500/10 p-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-lg bg-purple-500/20 text-purple-300 shrink-0">
              <Terminal className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-mono font-bold text-white truncate">
                {scriptName || "main"}
              </p>
              <p className="text-[10px] text-purple-300/80 font-mono">
                {formatBytes(byteLength)} compiled bytecode
              </p>
            </div>
          </div>
          <span className="shrink-0 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-200 border border-purple-500/30">
            Ready
          </span>
        </div>

        {/* Type Arguments */}
        <Field
          label="Type Arguments (Generics)"
          hint="Specify type tags if your script function accepts generics e.g. <0x1::supra_coin::SupraCoin>."
        >
          <div className="space-y-2">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={addTypeArg}
                className="text-[11px] text-purple-400 hover:text-purple-300 inline-flex items-center gap-1 font-semibold"
              >
                <Plus className="w-3.5 h-3.5" /> Add Type Tag
              </button>
            </div>

            {typeArgs.length === 0 ? (
              <p className="text-[11px] text-gray-500 italic bg-black/30 p-2.5 rounded-lg border border-white/5">
                No generic type parameters required.
              </p>
            ) : (
              typeArgs.map((t, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={t}
                    onChange={(e) => updateTypeArg(idx, e.target.value)}
                    placeholder="e.g. 0x1::supra_coin::SupraCoin or u64"
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={() => removeTypeArg(idx)}
                    className="p-2 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </Field>

        {/* Arguments */}
        <Field
          label="Script Arguments"
          hint="Arguments passed to fun main(...). The first &signer caller parameter is supplied automatically by your wallet."
        >
          <div className="space-y-2">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={addArg}
                className="text-[11px] text-purple-400 hover:text-purple-300 inline-flex items-center gap-1 font-semibold"
              >
                <Plus className="w-3.5 h-3.5" /> Add Argument
              </button>
            </div>

            {args.length === 0 ? (
              <p className="text-[11px] text-gray-500 italic bg-black/30 p-2.5 rounded-lg border border-white/5">
                No runtime arguments.
              </p>
            ) : (
              args.map((a) => (
                <div key={a.id} className="flex gap-2 items-center">
                  <select
                    value={a.type}
                    onChange={(e) => updateArg(a.id, "type", e.target.value)}
                    className="w-28 rounded-lg border border-white/10 bg-black/50 px-2 py-2 font-mono text-xs text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="u8">u8</option>
                    <option value="u32">u32</option>
                    <option value="u64">u64</option>
                    <option value="u128">u128</option>
                    <option value="u256">u256</option>
                    <option value="bool">bool</option>
                    <option value="address">address</option>
                    <option value="u8_vector">vector&lt;u8&gt;</option>
                  </select>

                  <input
                    type="text"
                    value={a.value}
                    onChange={(e) => updateArg(a.id, "value", e.target.value)}
                    placeholder={`Value for ${a.type}`}
                    className={inputCls}
                  />

                  <button
                    type="button"
                    onClick={() => removeArg(a.id)}
                    className="p-2 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </Field>

        {/* Results display */}
        {txHash && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Script Transaction Executed!</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-xs font-mono text-emerald-200 bg-black/50 p-2 rounded-lg overflow-x-auto">
              <span className="truncate">{txHash}</span>
              <a
                href={getExplorerUrl(network, "transaction", txHash) || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-emerald-400 hover:underline shrink-0"
              >
                Explorer <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 space-y-1">
            <div className="flex items-center gap-2 text-rose-400 font-bold text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Execution Failed</span>
            </div>
            <p className="text-[11px] text-rose-300 font-mono break-all">{error}</p>
          </div>
        )}
      </Form>
    </div>
  );
}
