"use client";

import { useTranslations } from "next-intl";
import { useState, useEffect } from "react";
import { useSupraWallet } from "@/context/SupraWalletContext";
import { motion } from "framer-motion";
import useView from "@/hooks/features/view/useView";
import { useContractModules } from "@/hooks/features/contracts/useContractModules";
import { formatSupraError } from "@/utils/supra/errors";
import { parseMoveArgument } from "@/utils/moveParser";
import { showTransactionSuccessAlert, showErrorToast } from '@/utils/supra/alertService';
import { useNetwork } from '@/context/NetworkContext';

// Wizard Subcomponents
import { MeshBackground } from "./wizard/MeshBackground";
import { AddressInput } from "./wizard/AddressInput";
import { ContractTabs } from "./wizard/ContractTabs";
import { WizardUrlSync } from "./wizard/WizardUrlSync";
import { Suspense } from "react";

export default function TaskWizard() {
  const t = useTranslations("Dashboard");
  const { network } = useNetwork();
  const { accounts, connect, disconnect, rpcUrl, sendRawTransaction } = useSupraWallet();
  const address = accounts[0] || "";
  const isConnected = !!address;

  const {
    modules,
    selectedModule,
    functions,
    authKey,
    isScanning,
    scanModules,
    handleSelectModule,
    clearModules,
  } = useContractModules();

  useEffect(() => {
    clearModules();
  }, [network, clearModules]);

  const { callView } = useView();
  const [manualAddress, setManualAddress] = useState("");

  const targetAddress = manualAddress || address;

  const handleExecuteFunction = async (func: any, functionParams: { [key: string]: string }, typeParams: { [key: string]: string }) => {
    if (!selectedModule || !targetAddress) return { success: false, error: "Module or Address not selected." };

    try {
      const paramList = (func.params || []).filter((p: string) => p !== '&signer');
      const genericParamList = func.generic_type_params || [];

      // Use the universal parser to generate the EXACT javascript types needed for the payload
      const parsedArgs = paramList.map((paramType: string, idx: number) => {
        const val = functionParams[idx] || "";
        return parseMoveArgument(val, paramType);
      });

      // Map the generic type params to an array of strings
      const rawTypeArgs = genericParamList.map((_: any, idx: number) => {
        return typeParams[idx] || "";
      });

      if (func.is_view) {
        const viewData = await callView(
          rpcUrl,
          targetAddress,
          selectedModule.name,
          func.name,
          rawTypeArgs,
          parsedArgs
        );
        return { success: true, result: viewData?.result || viewData };
      } else {
        const txHash = await sendRawTransaction(
          targetAddress,
          selectedModule.name,
          func.name,
          parsedArgs,
          rawTypeArgs
        );

        if (txHash) {
          showTransactionSuccessAlert(txHash, network);
          return { success: true, result: `Transaction Submitted!\nHash: ${txHash}` };
        } else {
          return { success: false, error: "Transaction was cancelled or failed without a hash." };
        }
      }
    } catch (error: any) {
      console.error("Execution failed:", error);
      if (!func.is_view) {
        showErrorToast('Execution Failed', formatSupraError(error) || 'There was an error processing your transaction. Please try again.');
      }
      return { success: false, error: formatSupraError(error) };
    }
  };

  const glassStyle = "bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl hover:shadow-[0_0_30px_rgba(221,20,56,0.1)] transition-shadow duration-500";

  return (
    <section id="automationSection" className="content-section p-4 sm:p-6 max-w-7xl mx-auto flex-1 w-full relative">
      <MeshBackground />
      <Suspense fallback={null}>
        <WizardUrlSync
          manualAddress={manualAddress}
          setManualAddress={setManualAddress}
          selectedModuleName={selectedModule?.name}
          address={address}
          scanModules={scanModules}
          rpcUrl={rpcUrl}
          modules={modules}
          onSelectModule={handleSelectModule}
        />
      </Suspense>
      {/* Target Address Search Bar */}
      <AddressInput
        isConnected={isConnected}
        address={address}
        manualAddress={manualAddress}
        setManualAddress={setManualAddress}
        onScan={(addr?: string) => {
          // Si el usuario da click en una pastilla, pasamos la address directo. Sino, usamos lo escrito, o la conectada.
          const addressToScan = (typeof addr === 'string' ? addr : manualAddress) || address;
          if (addressToScan) {
            scanModules(addressToScan, rpcUrl);
          }
        }}
        onConnect={() => connect('starkey')}
        onDisconnect={disconnect}
        glassStyle={glassStyle}
      />

      {/* Loading Skeleton */}
      {isScanning && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className={`p-6 rounded-2xl ${glassStyle} mb-6`}
        >
          <div className="h-6 bg-white/10 rounded w-1/4 mb-6 animate-pulse"></div>
          <div className="flex border-b border-white/10 mb-6">
            <div className="flex-1 py-4"><div className="h-4 bg-white/10 rounded w-1/3 mx-auto animate-pulse"></div></div>
            <div className="flex-1 py-4"><div className="h-4 bg-white/10 rounded w-1/3 mx-auto animate-pulse"></div></div>
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-[60px] bg-white/5 rounded-xl border border-white/5 animate-pulse"></div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Tabbed Interface */}
      {!isScanning && modules.length > 0 && (
        <ContractTabs
          isConnected={isConnected}
          onConnect={() => window.dispatchEvent(new Event('open-wallet-modal'))}
          modules={modules}
          selectedModule={selectedModule}
          onSelectModule={handleSelectModule}
          functions={functions}
          authKey={authKey}
          contractAddress={targetAddress}
          onExecute={handleExecuteFunction}
          glassStyle={glassStyle}
        />
      )}
    </section>
  );
}
