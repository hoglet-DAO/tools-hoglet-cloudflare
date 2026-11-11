"use client";

import { useTranslations } from "next-intl";
import { useState, useEffect, useRef } from "react";
import { useSupraWallet } from "@/context/SupraWalletContext";
import { motion } from "framer-motion";
import useView from "@/hooks/features/view/useView";
import { useContractModules } from "@/hooks/features/contracts/useContractModules";
import { useAddressSubject } from "@/hooks/features/useAddressSubject";
import { STORAGE_KEYS } from "@/lib/storage";
import { formatSupraError } from "@/utils/supra/errors";
import { parseMoveArgument } from "@/utils/moveParser";
import { showTransactionSuccessAlert, showErrorToast } from '@/utils/supra/alertService';
import { useNetwork } from '@/context/NetworkContext';
import { trace } from '@/lib/debug';

// Wizard Subcomponents
import { MeshBackground } from "./wizard/MeshBackground";
import { ContractTabs } from "./wizard/ContractTabs";
import { WizardUrlSync } from "./wizard/WizardUrlSync";
import { SubjectBar } from "./contracts/SubjectBar";
import { Suspense } from "react";

export default function TaskWizard() {
  const t = useTranslations("Dashboard");
  const { network } = useNetwork();
  const { accounts, rpcUrl, sendRawTransaction } = useSupraWallet();
  const address = accounts[0] || "";
  const isConnected = !!address;

  const {
    modules,
    selectedModule,
    functions,
    authKey,
    isScanning,
    hasMoreModules,
    isLoadingMore,
    scanModules,
    loadMoreModules,
    handleSelectModule,
    clearModules,
  } = useContractModules();

  useEffect(() => {
    clearModules();
  }, [network, clearModules]);

  const { callView } = useView();

  /**
   * The address being explored, owned by the shared hook.
   *
   * It used to live here as three separate things — `manualAddress` state, a recents list read and
   * written by hand, and a `?address` reader that duplicated the one in `WizardUrlSync`, so a shared
   * link scanned twice. Now the hook reads the deep link once and owns the parameter.
   */
  const {
    address: manualAddress,
    setAddress: setManualAddress,
    submit,
    recents: recentSearches,
  } = useAddressSubject({
    storageKey: STORAGE_KEYS.contractRecent,
    onCommit: (addr) => scanModules(addr, rpcUrl),
  });

  const handleScan = (addrToScan?: string) => {
    submit(addrToScan);
  };

  /**
   * Falls back to the connected wallet when the URL names no contract.
   *
   * This lived in `WizardUrlSync` as a side effect of its address read. It stays here because it is a
   * decision about what to show on arrival, not part of keeping the URL and the field in step.
   */
  const shownOnce = useRef(false);
  useEffect(() => {
    if (shownOnce.current) return;
    shownOnce.current = true;
    // A `?address` in the URL wins: the hook has already committed and scanned it by now.
    if (manualAddress || !address || !rpcUrl) return;
    scanModules(address, rpcUrl);
  }, [manualAddress, address, rpcUrl, scanModules]);

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
        const val = typeParams[idx] || "";
        if (val?.includes("::") && !val.startsWith("0x")) {
          return "0x" + val;
        }
        return val;
      });

      trace("[interactor:execute]", {
        call: `${targetAddress}::${selectedModule.name}::${func.name}`,
        kind: func.is_entry ? "entry" : func.is_view ? "view" : "internal",
        visibility: func.visibility,
        paramTypes: paramList,
        rawInput: functionParams,
        parsedArgs,
        typeArgs: rawTypeArgs,
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
          selectedModuleName={selectedModule?.name}
          modules={modules}
          onSelectModule={handleSelectModule}
        />
      </Suspense>
      {/* Target Address Search Bar */}
      <SubjectBar
        mode="interact"
        value={manualAddress}
        onChange={setManualAddress}
        onSubmit={() => handleScan(manualAddress || address)}
        isScanning={isScanning}
        recents={recentSearches}
        onPickRecent={(addr) => {
          setManualAddress(addr);
          handleScan(addr);
        }}
        placeholder={isConnected && address ? address : "0x..."}
        showPopular
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
          hasMoreModules={hasMoreModules}
          isLoadingMore={isLoadingMore}
          onLoadMoreModules={loadMoreModules}
        />
      )}
    </section>
  );
}
