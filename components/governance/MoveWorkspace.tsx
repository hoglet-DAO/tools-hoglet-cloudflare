"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { compileInBrowser, testInBrowser } from "@/lib/move/compileBrowser";
import type { IncludedArtifacts } from "@/lib/move/compileService";
import { buildContractGuide } from "@/lib/move/aiPrompt";
import {
  addressNamesUsedByModules,
  buildMoveToml,
  canPersist,
  deleteProject,
  isValidModulePath,
  isValidPackageName,
  listProjects,
  loadProject,
  moduleLabel,
  moduleNameFromPath,
  modulePathFor,
  newModuleSource,
  newProjectId,
  nextProjectName,
  projectFromFiles,
  projectToExportFiles,
  projectToFiles,
  renameModuleDeclaration,
  renamePackageInSource,
  renamePackageInToml,
  saveProject,
  sourceSizeBytes,
  starterModule,
  validateToml,
  type MoveModule,
  type MoveProject,
  type ProjectSummary,
  type SaveFailureReason,
  type StarterVariant,
} from "@/lib/move/project";
import { useRememberedPackageSize } from "@/hooks/features/contracts/useRememberedPackageSize";
import { createZip } from "@/lib/move/zip";
import { useGovernanceAuditContext } from "@/components/governance/GovernanceAuditContext";
import { parseDiagnostics, stripAnsi, summarizeTests, type TestSummary } from "@/lib/move/diagnostics";
import { useNetwork } from "@/context/NetworkContext";
import { getExplorerUrl } from "@/utils/supra/explorerUtils";
import { WorkspaceProjectBar } from "./workspace/WorkspaceProjectBar";
import { WorkspaceEmptyTarget } from "./workspace/WorkspaceEmptyTarget";
import { WorkspaceIdentity } from "./workspace/WorkspaceIdentity";
import { WorkspaceFileTree } from "./workspace/WorkspaceFileTree";
import { WorkspaceActions } from "./workspace/WorkspaceActions";
import { WorkspaceDiagnostics } from "./workspace/WorkspaceDiagnostics";
import { WorkspaceArtifacts, type CompiledModuleBytes } from "./workspace/WorkspaceArtifacts";

export function MoveWorkspace({
  creator,
  onArtifacts,
  onTarget,
  onLabel,
}: {
  creator: string;
  onArtifacts: (a: { metadataHex: string; modules: { name: string; hex: string }[] } | null) => void;
  onTarget: (address: string) => void;
  onLabel?: (label: string) => void;
}) {
  const t = useTranslations("Governance");
  const { network } = useNetwork();
  const { rpcUrl, predictResourceAccount, connect } = useGovernanceAuditContext();
  const key = useMemo(() => (creator || "unbound").toLowerCase(), [creator]);

  const [name, setName] = useState("my_package");
  const [seed, setSeed] = useState("");
  const [modules, setModules] = useState<MoveModule[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [activeId, setActiveId] = useState("");
  const [target, setTarget] = useState("");
  const [active, setActive] = useState(0);
  const [newPath, setNewPath] = useState("");
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [tomlOverride, setTomlOverride] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ kind: "toml" } | { kind: "module"; index: number }>({
    kind: "module",
    index: 0,
  });

  const [compiling, setCompiling] = useState(false);
  const [testing, setTesting] = useState(false);
  const [includedArtifacts, setIncludedArtifacts] = useState<IncludedArtifacts | "">("");
  const [overrideSizeCheck, setOverrideSizeCheck] = useState(false);
  const [testResult, setTestResult] = useState<TestSummary | null>(null);
  const [result, setResult] = useState<{
    ok: boolean;
    modules: string[];
    ms: number;
    cached: boolean;
    sizeBytes?: number;
    metadataHex?: string | null;
    bytecode?: CompiledModuleBytes[];
  } | null>(null);
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [serviceRetry, setServiceRetry] = useState(false);
  const [copiedAi, setCopiedAi] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saved" | SaveFailureReason>("idle");

  const loaded = useRef<string | null>(null);
  const lastName = useRef("my_package");
  const fileInput = useRef<HTMLInputElement>(null);
  const suppliedArtifacts = useRef(false);

  const onArtifactsRef = useRef(onArtifacts);
  useEffect(() => {
    onArtifactsRef.current = onArtifacts;
  }, [onArtifacts]);

  const invalidateOwnArtifacts = useCallback(() => {
    if (suppliedArtifacts.current) onArtifactsRef.current(null);
  }, []);

  const startProject = useCallback(
    (projectName: string): ProjectSummary => {
      const id = newProjectId();
      const fresh: MoveProject = {
        id,
        name: projectName,
        seed: "",
        address: "",
        modules: [starterModule(projectName)],
        tomlOverride: null,
        updatedAt: Date.now(),
      };
      saveProject(key, fresh);
      return { id, name: projectName, updatedAt: fresh.updatedAt };
    },
    [key]
  );

  useEffect(() => {
    const list = listProjects(key);
    if (list.length) {
      setProjects(list);
      setActiveId(list[0].id);
      return;
    }
    const created = startProject(nextProjectName([]));
    setProjects([created]);
    setActiveId(created.id);
  }, [key, startProject]);

  useEffect(() => {
    if (!activeId) return;
    const open = `${key}:${activeId}`;
    if (loaded.current === open) return;
    loaded.current = open;
    const stored = loadProject(key, activeId);
    const initialName = stored?.name ?? "my_package";
    setName(initialName);
    lastName.current = initialName;
    setModules(stored && stored.modules.length ? stored.modules : [starterModule(initialName)]);
    setActive(0);
    setEditing({ kind: "module", index: 0 });
    setTomlOverride(stored?.tomlOverride ?? null);
    setSeed(stored?.seed ?? "");
    setResult(null);
    setOutput("");
    setError(null);
    setNotice(null);
    setServiceRetry(false);
    setSaveState(canPersist() ? "idle" : "blocked");
    invalidateOwnArtifacts();
  }, [key, activeId, invalidateOwnArtifacts]);

  useEffect(() => {
    if (!activeId || loaded.current !== `${key}:${activeId}`) return;
    const t = setTimeout(() => {
      const res = saveProject(key, {
        id: activeId,
        name,
        seed,
        address: target,
        modules,
        tomlOverride,
        updatedAt: Date.now(),
      });
      setSaveState(res.ok ? "saved" : res.reason);
      setProjects((prev) => {
        const cur = prev.find((p) => p.id === activeId);
        return !cur || cur.name === name ? prev : prev.map((p) => (p.id === activeId ? { ...p, name } : p));
      });
    }, 400);
    return () => clearTimeout(t);
  }, [key, activeId, name, seed, modules, target, tomlOverride]);

  const addProject = useCallback(() => {
    const created = startProject(nextProjectName(projects.map((p) => p.name)));
    setProjects((prev) => [created, ...prev]);
    setActiveId(created.id);
  }, [startProject, projects]);

  const removeProject = useCallback(() => {
    if (!activeId) return;
    deleteProject(key, activeId);
    const rest = projects.filter((p) => p.id !== activeId);
    if (rest.length) {
      setProjects(rest);
      setActiveId(rest[0].id);
      return;
    }
    const created = startProject(nextProjectName([]));
    setProjects([created]);
    setActiveId(created.id);
  }, [key, activeId, projects, startProject]);

  const generatedToml = useMemo(() => buildMoveToml(name, target), [name, target]);
  const effectiveToml = tomlOverride ?? generatedToml;
  const tomlCheck = useMemo(
    () =>
      target
        ? validateToml(
            effectiveToml,
            target,
            addressNamesUsedByModules(modules.map((m) => m.source)),
            name
          )
        : null,
    [effectiveToml, target, modules, name]
  );

  const project = useMemo(
    () => ({ name, address: target, modules, tomlOverride, updatedAt: 0 }),
    [name, modules, target, tomlOverride]
  );

  const sourceBytes = useMemo(() => sourceSizeBytes(project), [project]);
  const rememberedBytes = useRememberedPackageSize(project, includedArtifacts, overrideSizeCheck);

  const explorerUrl = useMemo(
    () => (target ? getExplorerUrl(network, "address", target) : null),
    [network, target]
  );
  const nameOk = isValidPackageName(name);
  const label = seed.trim() || name;
  const labelOk = isValidPackageName(label);

  useEffect(() => {
    onLabel?.(labelOk ? label : "");
  }, [label, labelOk, onLabel]);

  useEffect(() => {
    if (!rpcUrl || !creator || !labelOk) {
      setTarget("");
      onTarget("");
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      predictResourceAccount(rpcUrl, creator, label)
        .then((addr) => {
          if (!live) return;
          setTarget(addr ?? "");
          onTarget(addr ?? "");
        })
        .catch(() => {
          if (!live) return;
          setTarget("");
          onTarget("");
        });
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [rpcUrl, creator, label, labelOk, predictResourceAccount, onTarget]);

  const update = useCallback(
    (next: string) => {
      if (editing.kind === "toml") {
        setTomlOverride(next);
      } else {
        const i = editing.index;
        setModules((prev) => prev.map((m, idx) => (idx === i ? { ...m, source: next } : m)));
      }
      setResult(null);
      invalidateOwnArtifacts();
    },
    [editing, invalidateOwnArtifacts]
  );

  const handleNameChange = useCallback((next: string) => {
    const from = lastName.current;
    lastName.current = next;
    setName(next);
    if (!from || from === next) return;
    setModules((prev) =>
      prev.map((m) => ({ ...m, source: renamePackageInSource(m.source, from, next) }))
    );
    setTomlOverride((prev) => (prev === null ? null : renamePackageInToml(prev, from, next)));
    setResult(null);
    invalidateOwnArtifacts();
  }, [invalidateOwnArtifacts]);

  const handleImport = useCallback(
    async (picked: FileList | null, source: "folder" | "files") => {
      setError(null);
      setNotice(null);
      setServiceRetry(false);
      setResult(null);
      setTestResult(null);
      if (!picked?.length) {
        if (source === "folder") {
          fileInput.current?.click();
          return;
        }
        setError(t("workspaceImportEmpty"));
        return;
      }
      try {
        const files = await Promise.all(
          Array.from(picked).map(async (f) => ({
            name: f.name,
            relativePath: (f as any).webkitRelativePath || undefined,
            content: await f.text(),
          }))
        );
        const res = projectFromFiles(files, name);
        if (!res.ok || !res.project) {
          setError(res.error || t("workspaceImportFailed"));
          return;
        }
        const p = res.project;
        setName(p.name);
        lastName.current = p.name;
        setModules(p.modules);
        setEditing({ kind: "module", index: 0 });
        setTomlOverride(p.tomlOverride ?? null);
        setSeed("");
        setOutput("");
        setSaveState(canPersist() ? "idle" : "blocked");
        invalidateOwnArtifacts();
        if (res.skipped?.length) {
          setNotice(t("workspaceImportSkipped", { count: res.skipped.length }));
        }
      } catch (e: any) {
        setError(e?.message || t("workspaceImportFailed"));
      }
    },
    [t, name, invalidateOwnArtifacts]
  );

  const addModule = useCallback(() => {
    const raw = newPath.trim();
    if (!raw) {
      setError(t("workspaceBadName"));
      return;
    }
    const path = raw.includes("/") ? raw : modulePathFor(raw);
    if (!isValidModulePath(path)) {
      setError(t("workspaceBadName"));
      return;
    }
    if (modules.some((m) => m.path === path)) {
      setError(t("workspaceDuplicate"));
      return;
    }
    setModules((prev) => [...prev, { path, source: newModuleSource(name, moduleNameFromPath(path)) }]);
    setActive(modules.length);
    setEditing({ kind: "module", index: modules.length });
    setNewPath("");
    setAdding(false);
    setError(null);
  }, [newPath, modules, name, t]);

  const commitRename = useCallback(
    (index: number, nextPath: string) => {
      const trimmed = nextPath.trim();
      setRenaming(null);
      setError(null);
      if (!isValidModulePath(trimmed)) {
        setError(t("workspaceBadPath"));
        return;
      }
      if (modules.some((m, i) => i !== index && m.path === trimmed)) {
        setError(t("workspaceDuplicate"));
        return;
      }
      const nextName = moduleNameFromPath(trimmed);
      setModules((prev) =>
        prev.map((m, i) =>
          i === index ? { path: trimmed, source: renameModuleDeclaration(m.source, nextName) } : m
        )
      );
      setResult(null);
      invalidateOwnArtifacts();
    },
    [modules, t, invalidateOwnArtifacts]
  );

  const removeModule = useCallback(
    (index: number) => {
      if (modules.length === 1) {
        setError(t("workspaceNeedOne"));
        return;
      }
      setModules((prev) => prev.filter((_, i) => i !== index));
      setActive(0);
      setResult(null);
      invalidateOwnArtifacts();
    },
    [modules.length, t, invalidateOwnArtifacts]
  );

  const handleExport = useCallback(() => {
    setError(null);
    try {
      const entries = projectToExportFiles({ ...project, modules });
      const zip = createZip(entries);
      const blob = new Blob([zip.slice().buffer as ArrayBuffer], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name || "move-package"}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (e: any) {
      setError(e?.message || "could not build the archive");
    }
  }, [project, modules, name]);

  const handleTest = useCallback(async () => {
    setError(null);
    setTesting(true);
    setOutput("");
    const res = await testInBrowser(projectToFiles({ ...project, modules }));
    setTesting(false);
    setOutput(stripAnsi(`${res.stdout}\n${res.stderr}`).trim());
    setTestResult(summarizeTests(res.stdout || ""));
    if (!res.ok && res.error) setError(res.error);
  }, [project, modules]);

  const loadTemplate = useCallback(
    (variant: StarterVariant) => {
      const pkg = isValidPackageName(name) ? name : "my_package";
      setModules([starterModule(pkg, variant)]);
      setEditing({ kind: "module", index: 0 });
      setTomlOverride(null);
      setSeed("");
      setResult(null);
      setOutput("");
      setError(null);
      setNotice(null);
      setServiceRetry(false);
      setSaveState(canPersist() ? "idle" : "blocked");
      invalidateOwnArtifacts();
    },
    [name, invalidateOwnArtifacts]
  );

  const handleCompile = useCallback(
    async (overrides?: { includedArtifacts?: IncludedArtifacts | ""; overrideSizeCheck?: boolean }) => {
      const ia = overrides?.includedArtifacts ?? includedArtifacts;
      const osc = overrides?.overrideSizeCheck ?? overrideSizeCheck;
      setError(null);
      setCompiling(true);
      setOutput("");
      setServiceRetry(false);
      const res = await compileInBrowser(projectToFiles({ ...project, modules }), {
        includedArtifacts: ia || undefined,
        overrideSizeCheck: osc,
      });
      setCompiling(false);
      const combined = stripAnsi(`${res.stdout}\n${res.stderr}`).trim();
      setOutput(combined);
      if (!res.ok) {
        setResult({ ok: false, modules: [], ms: res.ms, cached: false });
        invalidateOwnArtifacts();
        if (res.error) setError(res.error);
        return;
      }

      setResult({
        ok: true,
        modules: res.modules,
        ms: res.ms,
        cached: res.cached,
        sizeBytes: res.sizeBytes,
        metadataHex: res.metadata,
        bytecode: res.bytecode.map((hex, i) => ({
          name: moduleLabel(res.modules[i], i),
          hex,
          bytes: hex.startsWith("0x") ? (hex.length - 2) / 2 : hex.length / 2,
        })),
      });

      if (res.metadata && res.bytecode.length === res.modules.length && res.bytecode.length > 0) {
        suppliedArtifacts.current = true;
        onArtifactsRef.current({
          metadataHex: res.metadata,
          modules: res.bytecode.map((hex, i) => ({ name: moduleLabel(res.modules[i], i), hex })),
        });
      } else {
        invalidateOwnArtifacts();
        if (res.artifactsOmitted) setError(t("workspaceArtifactsOmitted"));
      }

      const noteText = res.note ?? res.hint ?? null;
      setNotice(noteText);
      setServiceRetry(res.artifactsOmitted || (!!noteText && /large/i.test(noteText)));
    },
    [project, modules, t, invalidateOwnArtifacts, includedArtifacts, overrideSizeCheck]
  );

  const retryWithNone = useCallback(() => {
    setIncludedArtifacts("none");
    void handleCompile({ includedArtifacts: "none" });
  }, [handleCompile]);

  const retryWithOverride = useCallback(() => {
    setOverrideSizeCheck(true);
    void handleCompile({ overrideSizeCheck: true });
  }, [handleCompile]);

  const handleCopyAiPrompt = useCallback(() => {
    navigator.clipboard.writeText(buildContractGuide(name, target));
    setCopiedAi(true);
    setTimeout(() => setCopiedAi(false), 2000);
  }, [name, target]);

  const diagnostics = useMemo(
    () => (output ? parseDiagnostics(output, modules.map((m) => m.path)) : []),
    [output, modules]
  );
  const ownDiagnostics = useMemo(() => diagnostics.filter((d) => !d.external), [diagnostics]);
  const externalDiagnostics = useMemo(() => diagnostics.filter((d) => d.external), [diagnostics]);

  const projectBar = (
    <WorkspaceProjectBar
      t={t}
      projects={projects}
      activeId={activeId}
      onSelectProject={setActiveId}
      onAddProject={addProject}
      onRemoveProject={removeProject}
    />
  );

  if (!target) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
        {projectBar}
        <WorkspaceEmptyTarget
          t={t}
          creator={creator}
          name={name}
          onConnect={() => connect("starkey")}
        />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      {projectBar}

      <WorkspaceIdentity
        t={t}
        name={name}
        nameOk={nameOk}
        labelOk={labelOk}
        target={target}
        seed={seed}
        explorerUrl={explorerUrl}
        onNameChange={handleNameChange}
        onSeedChange={setSeed}
      />

      <WorkspaceFileTree
        t={t}
        name={name}
        modules={modules}
        editing={editing}
        tomlOverride={tomlOverride}
        effectiveToml={effectiveToml}
        tomlCheck={tomlCheck}
        target={target}
        adding={adding}
        newPath={newPath}
        renaming={renaming}
        renameValue={renameValue}
        onAddingChange={setAdding}
        onNewPathChange={setNewPath}
        onAddModule={addModule}
        onSelectToml={() => setEditing({ kind: "toml" })}
        onRegenerateToml={() => setTomlOverride(null)}
        onSelectModule={(index) => setEditing({ kind: "module", index })}
        onStartRename={(index, path) => {
          setRenaming(index);
          setRenameValue(path);
        }}
        onRenameValueChange={setRenameValue}
        onCommitRename={commitRename}
        onCancelRename={() => setRenaming(null)}
        onRemoveModule={removeModule}
        onEditorUpdate={update}
      />

      <WorkspaceActions
        t={t}
        compiling={compiling}
        testing={testing}
        nameOk={nameOk}
        modulesLength={modules.length}
        result={result}
        testResult={testResult}
        sourceBytes={sourceBytes}
        rememberedBytes={rememberedBytes}
        onCompile={handleCompile}
        onTest={handleTest}
        onImport={handleImport}
        onExport={handleExport}
        onLoadTemplate={loadTemplate}
        includedArtifacts={includedArtifacts}
        onIncludedArtifactsChange={setIncludedArtifacts}
        overrideSizeCheck={overrideSizeCheck}
        onOverrideSizeCheckChange={setOverrideSizeCheck}
        onCopyAiPrompt={handleCopyAiPrompt}
        copiedAi={copiedAi}
      />

      {result?.ok && result.bytecode && result.bytecode.length > 0 && (
        <WorkspaceArtifacts
          t={t}
          modules={result.bytecode}
          metadataHex={result.metadataHex}
          packageName={name}
        />
      )}

      <WorkspaceDiagnostics
        t={t}
        ownDiagnostics={ownDiagnostics}
        externalDiagnostics={externalDiagnostics}
        output={output}
        error={error}
        notice={notice}
        saveState={saveState}
        serviceRetry={serviceRetry}
        showRetryNone={includedArtifacts !== "none"}
        showRetryOverride={!overrideSizeCheck}
        onRetryNone={retryWithNone}
        onRetryOverride={retryWithOverride}
        onSelectModule={(path) => {
          const i = modules.findIndex((m) => m.path === path);
          if (i >= 0) setEditing({ kind: "module", index: i });
        }}
      />
    </div>
  );
}