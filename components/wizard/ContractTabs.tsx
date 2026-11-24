"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { Code2, FileCode2, Loader2 } from "lucide-react";

// Subcomponents
import { ModuleNavigation } from "./ModuleNavigation";
import { MobileModuleModal } from "./MobileModuleModal";
import { FunctionSidebar } from "./FunctionSidebar";
import { FunctionForm } from "./FunctionForm";

/**
 * CodeMirror and the source viewer are heavy and only needed on the Source
 * tab, so they stay out of the interactor's initial bundle.
 */
const SourceTab = dynamic(() => import("./SourceTab").then((m) => m.SourceTab), {
  ssr: false,
  loading: () => (
    <div className="flex items-center gap-2 p-6 text-xs text-gray-500">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading source…
    </div>
  ),
});

interface ContractTabsProps {
  isConnected: boolean;
  onConnect: () => void;
  modules: any[];
  selectedModule: any;
  onSelectModule: (mod: any) => void;
  functions: any[];
  authKey?: string | null;
  contractAddress?: string;
  onExecute: (func: any, params: { [key: string]: string }, typeParams: { [key: string]: string }) => Promise<{ success: boolean; result?: any; error?: string }>;
  glassStyle: string;
  hasMoreModules?: boolean;
  isLoadingMore?: boolean;
  onLoadMoreModules?: () => Promise<boolean>;
}

export function ContractTabs({
  isConnected,
  onConnect,
  modules,
  selectedModule,
  onSelectModule,
  functions,
  authKey,
  contractAddress,
  onExecute,
  glassStyle,
  hasMoreModules,
  isLoadingMore,
  onLoadMoreModules,
}: ContractTabsProps) {
  const [selectedFunction, setSelectedFunction] = useState<any>(null);
  
  // Local state for the selected function execution
  const [functionParams, setFunctionParams] = useState<{ [key: string]: string }>({});
  const [typeParams, setTypeParams] = useState<{ [key: string]: string }>({});
  const [isDeploying, setIsDeploying] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tab, setTab] = useState<"functions" | "source">("functions");

  // Clear selected function if the module changes
  useEffect(() => {
    setSelectedFunction(null);
    setFunctionParams({});
    setTypeParams({});
    setResult(null);
    setError(null);
  }, [selectedModule]);

  if (modules.length === 0) return null;

  const handleExecute = async () => {
    if (!selectedFunction) return;
    setIsDeploying(true);
    setResult(null);
    setError(null);

    const { success, result: res, error: err } = await onExecute(selectedFunction, functionParams, typeParams);

    if (success) {
      setResult(res);
    } else {
      setError(err || "Unknown error");
    }
    
    setIsDeploying(false);
  };

  const paramsList = selectedFunction ? (selectedFunction.params || []).filter((p: string) => p !== '&signer') : [];
  const genericParamsList = selectedFunction ? (selectedFunction.generic_type_params || []) : [];

  const areAllParamsFilled = paramsList.every((_: any, idx: number) => {
      const val = functionParams[idx];
      return val !== undefined && val.trim() !== "";
  });

  const areAllTypeParamsFilled = genericParamsList.every((_: any, idx: number) => {
      const val = typeParams[idx];
      return val !== undefined && val.trim() !== "";
  });

  const isReadyToExecute = areAllParamsFilled && areAllTypeParamsFilled;

  return (
    <>
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`rounded-2xl ${glassStyle} flex flex-col relative`}
      >
        <ModuleNavigation 
          modules={modules}
          selectedModule={selectedModule}
          onSelectModule={onSelectModule}
          authKey={authKey}
          contractAddress={contractAddress}
          onOpenModal={() => setIsModalOpen(true)}
          hasMoreModules={hasMoreModules}
          isLoadingMore={isLoadingMore}
          onLoadMoreModules={onLoadMoreModules}
        />

        <div className="flex items-center gap-1 border-t border-white/5 px-4 py-2.5 sm:px-6">
          {([
            { id: "functions" as const, label: "Functions", icon: Code2 },
            { id: "source" as const, label: "Source", icon: FileCode2 },
          ]).map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                aria-pressed={active}
                className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                  active
                    ? "bg-cyan-500/15 text-cyan-200"
                    : "text-gray-500 hover:bg-white/5 hover:text-gray-200"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </div>

        {tab === "functions" ? (
          <div className="p-4 sm:p-6 lg:flex lg:gap-8 items-start">
          <FunctionSidebar 
            functions={functions}
            selectedFunction={selectedFunction}
            onSelectFunction={(func) => {
              setSelectedFunction(func);
              setFunctionParams({});
              setTypeParams({});
              setResult(null);
              setError(null);
            }}
            selectedModule={selectedModule}
          />

          <FunctionForm 
            selectedFunction={selectedFunction}
            selectedModule={selectedModule}
            contractAddress={contractAddress}
            isConnected={isConnected}
            onConnect={onConnect}
            functionParams={functionParams}
            setFunctionParams={setFunctionParams}
            typeParams={typeParams}
            setTypeParams={setTypeParams}
            isDeploying={isDeploying}
            isReadyToExecute={isReadyToExecute}
            handleExecute={handleExecute}
            result={result}
            error={error}
          />
          </div>
        ) : (
          <div className="p-4 sm:p-6">
            <SourceTab
              address={contractAddress ?? ""}
              moduleName={selectedModule?.abi?.name ?? selectedModule?.name ?? ""}
            />
          </div>
        )}
      </motion.div>

      <MobileModuleModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        modules={modules}
        selectedModule={selectedModule}
        onSelectModule={onSelectModule}
        hasMoreModules={hasMoreModules}
        isLoadingMore={isLoadingMore}
        onLoadMoreModules={onLoadMoreModules}
      />
    </>
  );
}
