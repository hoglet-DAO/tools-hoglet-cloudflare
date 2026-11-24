"use client";

import React, { useState } from "react";
import { Terminal, ScrollText } from "lucide-react";
import { MeshBackground } from "@/components/wizard/MeshBackground";
import { Shell, StageHeader } from "@/components/governance/lifecycle/LifecycleShared";
import { ScriptWorkspace, type ScriptCompileArtifact } from "./ScriptWorkspace";
import { ScriptArtifacts } from "./ScriptArtifacts";

export function ScriptsHub() {
  const [artifacts, setArtifacts] = useState<ScriptCompileArtifact[] | null>(null);
  const [projectName, setProjectName] = useState<string>("scripts");

  const handleArtifactsReady = (nextArtifacts: ScriptCompileArtifact[] | null, pName?: string) => {
    setArtifacts(nextArtifacts);
    if (pName) setProjectName(pName);
  };

  return (
    <section className="relative px-3 sm:px-6 py-6 sm:py-10 max-w-6xl mx-auto w-full">
      <MeshBackground />

      {/* Masthead */}
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 mb-2 backdrop-blur-md">
            <Terminal className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-xs font-bold text-purple-300 uppercase tracking-wider">
              Move Script Studio
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight text-white">
            Move Script Studio
          </h1>
          <p className="mt-1.5 text-xs sm:text-sm text-gray-400 max-w-2xl leading-relaxed">
            Author and compile atomic Move scripts into standalone bytecode (.mv) ready for CLI, automated bots, and off-chain signers.
          </p>
        </div>
      </header>

      {/* Main Shell Container (matching Deploy Contract) */}
      <Shell>
        <div className="space-y-4">
          <StageHeader
            icon={ScrollText}
            title="Atomic Script Workspace"
            body="Move scripts execute transiently without publishing permanent on-chain modules. Author your logic, compile against Supra compiler, and export the compiled .mv bytecode."
            tone="text-purple-300"
          />

          {/* Script Workspace with real file tree and Monaco editor */}
          <ScriptWorkspace onArtifactReady={handleArtifactsReady} />

          {/* Compiled Artifacts Box (.mv download, hex copy, CLI command) */}
          {artifacts && artifacts.length > 0 && (
            <ScriptArtifacts
              artifacts={artifacts}
              projectName={projectName}
            />
          )}
        </div>
      </Shell>
    </section>
  );
}
