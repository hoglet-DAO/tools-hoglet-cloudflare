"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";

// Subcomponents
import { ModuleNavigation } from "./ModuleNavigation";
import { MobileModuleModal } from "./MobileModuleModal";
import { FunctionSidebar } from "./FunctionSidebar";
import { FunctionForm } from "./FunctionForm";

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
        />

        {/* MAIN CONTENT AREA */}
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
      </motion.div>

      <MobileModuleModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        modules={modules}
        selectedModule={selectedModule}
        onSelectModule={onSelectModule}
      />
    </>
  );
}
