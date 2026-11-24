"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { compileInBrowser } from "@/lib/move/compileBrowser";
import { parseDiagnostics, stripAnsi } from "@/lib/move/diagnostics";
import { readJson, writeJson, STORAGE_KEYS } from "@/lib/storage";
import { createZip } from "@/lib/move/zip";
import { WorkspaceProjectBar } from "@/components/governance/workspace/WorkspaceProjectBar";
import { ScriptFileTree } from "./workspace/ScriptFileTree";
import { ScriptWorkspaceActions } from "./workspace/ScriptWorkspaceActions";
import { ScriptDiagnostics } from "./workspace/ScriptDiagnostics";
import { parseToml, renamePackageInToml, isValidPackageName } from "@/lib/move/project";
import {
  DEFAULT_SCRIPT_TOML,
  generateScriptToml,
  STARTER_SCRIPT_PATH,
  STARTER_SCRIPTS,
  type ScriptFile,
  type ScriptProject,
} from "./scriptTemplates";

const SCRIPTS_STORAGE_KEY = "hoglet.move.scripts.projects.v1";

export interface ScriptCompileArtifact {
  name: string;
  bytecodeHex: string;
}

export function ScriptWorkspace({
  onArtifactReady,
}: {
  onArtifactReady: (artifacts: ScriptCompileArtifact[] | null, projectName?: string) => void;
}) {
  const [projects, setProjects] = useState<ScriptProject[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [editing, setEditing] = useState<{ kind: "toml" } | { kind: "script"; index: number }>({
    kind: "script",
    index: 0,
  });

  const [adding, setAdding] = useState(false);
  const [newPath, setNewPath] = useState("");
  const [renaming, setRenaming] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const [compiling, setCompiling] = useState(false);
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copiedAi, setCopiedAi] = useState(false);

  const [result, setResult] = useState<{
    ok: boolean;
    scriptsCount: number;
    ms: number;
    cached: boolean;
    sizeBytes?: number;
  } | null>(null);

  // Load projects from storage
  useEffect(() => {
    const stored = readJson<ScriptProject[]>(SCRIPTS_STORAGE_KEY as any, []);
    if (stored && stored.length > 0) {
      setProjects(stored);
      setActiveId(stored[0].id);
    } else {
      const initial: ScriptProject = {
        id: "default-project",
        name: "my_scripts",
        updatedAt: Date.now(),
        files: [
          {
            path: STARTER_SCRIPT_PATH,
            content: STARTER_SCRIPTS.basic.source,
          },
        ],
        tomlOverride: null,
      };
      setProjects([initial]);
      setActiveId(initial.id);
      writeJson(SCRIPTS_STORAGE_KEY as any, [initial]);
    }
  }, []);

  const activeProject = useMemo(() => {
    return projects.find((p) => p.id === activeId) || projects[0] || null;
  }, [projects, activeId]);

  const saveCurrentProjects = useCallback((updated: ScriptProject[]) => {
    setProjects(updated);
    writeJson(SCRIPTS_STORAGE_KEY as any, updated);
  }, []);

  // Update file or manifest (with real-time Move.toml name sync)
  const updateContent = useCallback(
    (newContent: string) => {
      if (!activeProject) return;
      const updatedFiles = [...activeProject.files];
      let tomlOverride = activeProject.tomlOverride;
      let nextName = activeProject.name;

      if (editing.kind === "toml") {
        tomlOverride = newContent;
        try {
          const parsed = parseToml(newContent);
          if (parsed.packageName && parsed.packageName !== activeProject.name) {
            nextName = parsed.packageName;
          }
        } catch {}
      } else if (editing.kind === "script" && updatedFiles[editing.index]) {
        updatedFiles[editing.index] = {
          ...updatedFiles[editing.index],
          content: newContent,
        };
      }

      const nextProjects = projects.map((p) =>
        p.id === activeProject.id
          ? { ...p, name: nextName, files: updatedFiles, tomlOverride, updatedAt: Date.now() }
          : p
      );
      saveCurrentProjects(nextProjects);
    },
    [activeProject, editing, projects, saveCurrentProjects]
  );

  // Synchronize Package Name change to Move.toml (mirrors Deploy Contract)
  const handleNameChange = useCallback(
    (nextName: string) => {
      if (!activeProject) return;
      const from = activeProject.name;
      const currentToml = activeProject.tomlOverride || generateScriptToml(from);
      const nextToml = renamePackageInToml(currentToml, from, nextName);

      const nextProjects = projects.map((p) =>
        p.id === activeProject.id
          ? { ...p, name: nextName, tomlOverride: nextToml, updatedAt: Date.now() }
          : p
      );
      saveCurrentProjects(nextProjects);
      onArtifactReady(null);
    },
    [activeProject, projects, saveCurrentProjects, onArtifactReady]
  );

  // Project Bar Operations
  const handleAddProject = () => {
    const id = `project-${Date.now()}`;
    const name = `script_pkg_${projects.length + 1}`;
    const newProj: ScriptProject = {
      id,
      name,
      updatedAt: Date.now(),
      files: [
        {
          path: STARTER_SCRIPT_PATH,
          content: STARTER_SCRIPTS.basic.source,
        },
      ],
      tomlOverride: generateScriptToml(name),
    };
    const next = [...projects, newProj];
    saveCurrentProjects(next);
    setActiveId(id);
    setEditing({ kind: "script", index: 0 });
    onArtifactReady(null);
  };

  const handleRemoveProject = () => {
    if (projects.length <= 1) return;
    const next = projects.filter((p) => p.id !== activeId);
    saveCurrentProjects(next);
    setActiveId(next[0].id);
    setEditing({ kind: "script", index: 0 });
    onArtifactReady(null);
  };

  // File Tree Operations
  const handleAddScript = () => {
    if (!newPath.trim() || !activeProject) return;
    let path = newPath.trim();
    if (!path.endsWith(".move")) path += ".move";
    if (!path.startsWith("scripts/")) path = `scripts/${path}`;

    if (activeProject.files.some((f) => f.path === path)) {
      setError("A script with that name already exists.");
      return;
    }

    const nextFiles = [
      ...activeProject.files,
      {
        path,
        content: STARTER_SCRIPTS.basic.source,
      },
    ];

    const next = projects.map((p) =>
      p.id === activeProject.id ? { ...p, files: nextFiles, updatedAt: Date.now() } : p
    );
    saveCurrentProjects(next);
    setAdding(false);
    setNewPath("");
    setEditing({ kind: "script", index: nextFiles.length - 1 });
  };

  const handleCommitRename = (index: number, newName: string) => {
    if (!activeProject || !newName.trim()) {
      setRenaming(null);
      return;
    }
    let target = newName.trim();
    if (!target.endsWith(".move")) target += ".move";
    if (!target.startsWith("scripts/")) target = `scripts/${target}`;

    const nextFiles = [...activeProject.files];
    nextFiles[index] = { ...nextFiles[index], path: target };

    const next = projects.map((p) =>
      p.id === activeProject.id ? { ...p, files: nextFiles, updatedAt: Date.now() } : p
    );
    saveCurrentProjects(next);
    setRenaming(null);
  };

  const handleRemoveScript = (index: number) => {
    if (!activeProject || activeProject.files.length <= 1) return;
    const nextFiles = activeProject.files.filter((_, i) => i !== index);
    const next = projects.map((p) =>
      p.id === activeProject.id ? { ...p, files: nextFiles, updatedAt: Date.now() } : p
    );
    saveCurrentProjects(next);
    setEditing({ kind: "script", index: 0 });
  };

  // Compile
  const handleCompile = async () => {
    if (!activeProject) return;
    setCompiling(true);
    setError(null);
    setNotice(null);
    setOutput("");
    onArtifactReady(null);

    const files: Record<string, string> = {
      "Move.toml": activeProject.tomlOverride || generateScriptToml(activeProject.name),
    };
    activeProject.files.forEach((f) => {
      // The Move compiler strictly requires a sources/ directory to be present in the package root.
      // We map the script files to sources/ so supra move tool compile resolves them properly.
      const mappedPath = f.path.startsWith("scripts/")
        ? f.path.replace(/^scripts\//, "sources/")
        : f.path.startsWith("sources/")
        ? f.path
        : `sources/${f.path}`;
      files[mappedPath] = f.content;
    });

    try {
      const res = await compileInBrowser(files);
      setCompiling(false);
      const combined = stripAnsi(`${res.stdout}\n${res.stderr}`).trim();
      setOutput(combined);

      if (!res.ok) {
        setResult({ ok: false, scriptsCount: 0, ms: res.ms, cached: false });
        if (res.error) setError(res.error);
        return;
      }

      const scriptBytes = res.scripts || [];
      const scriptNames = res.scriptNames || [];

      if (scriptBytes.length > 0) {
        setResult({
          ok: true,
          scriptsCount: scriptBytes.length,
          ms: res.ms,
          cached: res.cached,
          sizeBytes: res.sizeBytes,
        });

        const compiledArtifacts: ScriptCompileArtifact[] = scriptBytes.map((hex, i) => ({
          name: scriptNames[i] || (scriptBytes.length === 1 ? "main" : `script_${i + 1}`),
          bytecodeHex: hex,
        }));

        onArtifactReady(compiledArtifacts, activeProject.name);
      } else {
        setResult({ ok: false, scriptsCount: 0, ms: res.ms, cached: false });
        setError("Compiled successfully, but no script block was found in the scripts/ folder.");
      }
    } catch (e: any) {
      setCompiling(false);
      setError(e?.message || "Failed to compile script.");
    }
  };

  // Templates
  const handleLoadTemplate = (variantKey: string) => {
    if (!activeProject) return;
    const tpl = STARTER_SCRIPTS[variantKey];
    if (!tpl) return;

    const nextFiles = [...activeProject.files];
    const currentIdx = editing.kind === "script" ? editing.index : 0;
    nextFiles[currentIdx] = {
      ...nextFiles[currentIdx],
      content: tpl.source,
    };

    const next = projects.map((p) =>
      p.id === activeProject.id ? { ...p, files: nextFiles, updatedAt: Date.now() } : p
    );
    saveCurrentProjects(next);
    setEditing({ kind: "script", index: currentIdx });
    setNotice(`Loaded "${tpl.name}" template`);
  };

  // Export ZIP
  const handleExport = async () => {
    if (!activeProject) return;
    const entries = [
      { path: "Move.toml", content: activeProject.tomlOverride || generateScriptToml(activeProject.name) },
      ...activeProject.files.map((f) => ({ path: f.path, content: f.content })),
    ];
    const zip = createZip(entries);
    const blob = new Blob([zip.slice().buffer as ArrayBuffer], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeProject.name || "move_script"}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // Import
  const handleImport = (importedFiles: { name: string; content: string }[]) => {
    if (!activeProject || !importedFiles.length) return;
    let nextToml = activeProject.tomlOverride;
    let nextName = activeProject.name;
    const nextFiles = [...activeProject.files];

    importedFiles.forEach((f) => {
      if (f.name === "Move.toml") {
        nextToml = f.content;
        try {
          const parsed = parseToml(f.content);
          if (parsed.packageName) nextName = parsed.packageName;
        } catch {}
      } else if (f.name.endsWith(".move")) {
        const path = `scripts/${f.name}`;
        const existingIdx = nextFiles.findIndex((ex) => ex.path === path);
        if (existingIdx >= 0) {
          nextFiles[existingIdx] = { path, content: f.content };
        } else {
          nextFiles.push({ path, content: f.content });
        }
      }
    });

    const next = projects.map((p) =>
      p.id === activeProject.id ? { ...p, name: nextName, files: nextFiles, tomlOverride: nextToml, updatedAt: Date.now() } : p
    );
    saveCurrentProjects(next);
    setNotice(`Imported ${importedFiles.length} file(s) into workspace.`);
  };

  const handleCopyAiPrompt = () => {
    const prompt = `You are a Move on Supra expert. Help me write or debug this Move script:
\`\`\`move
${editing.kind === "script" && activeProject?.files[editing.index] ? activeProject.files[editing.index].content : ""}
\`\`\`
Follow Supra and Move 2024 conventions, ensuring atomic execution with caller: &signer.`;
    navigator.clipboard.writeText(prompt);
    setCopiedAi(true);
    setTimeout(() => setCopiedAi(false), 2000);
  };

  const diagnostics = useMemo(
    () => (output && activeProject ? parseDiagnostics(output, activeProject.files.map((f) => f.path)) : []),
    [output, activeProject]
  );
  const ownDiagnostics = useMemo(() => diagnostics.filter((d) => !d.external), [diagnostics]);

  const sourceBytes = useMemo(() => {
    if (!activeProject) return 0;
    const encoder = new TextEncoder();
    return activeProject.files.reduce((acc, f) => acc + encoder.encode(f.content).length, 0);
  }, [activeProject]);

  if (!activeProject) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3 sm:p-4">
      {/* Project Bar */}
      <WorkspaceProjectBar
        t={(k) =>
          k === "workspaceProject"
            ? "Project"
            : k === "workspaceProjectNew"
            ? "New"
            : k === "workspaceProjectDelete"
            ? "Delete"
            : k
        }
        projects={projects.map((p) => ({ id: p.id, name: p.name, updatedAt: p.updatedAt }))}
        activeId={activeId}
        onSelectProject={(id) => {
          setActiveId(id);
          setEditing({ kind: "script", index: 0 });
          onArtifactReady(null);
        }}
        onAddProject={handleAddProject}
        onRemoveProject={handleRemoveProject}
      />

      {/* Package Name (mirrors Deploy Contract's WorkspaceIdentity) */}
      <div className="mb-3.5 mt-2">
        <label className="block max-w-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
            Package Name
          </span>
          <input
            value={activeProject.name}
            onChange={(e) => handleNameChange(e.target.value)}
            spellCheck={false}
            placeholder="e.g. move_script"
            className={`mt-1 w-full rounded-lg border bg-black/40 px-2.5 py-1.5 font-mono text-[12px] text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/40 ${
              isValidPackageName(activeProject.name) ? "border-white/10" : "border-rose-400/50"
            }`}
          />
        </label>
      </div>

      {/* Script File Tree & Monaco Editor */}
      <ScriptFileTree
        projectName={activeProject.name}
        files={activeProject.files}
        editing={editing}
        tomlOverride={activeProject.tomlOverride}
        effectiveToml={activeProject.tomlOverride || generateScriptToml(activeProject.name)}
        adding={adding}
        newPath={newPath}
        renaming={renaming}
        renameValue={renameValue}
        onAddingChange={setAdding}
        onNewPathChange={setNewPath}
        onAddScript={handleAddScript}
        onSelectToml={() => setEditing({ kind: "toml" })}
        onRegenerateToml={() => {
          const next = projects.map((p) =>
            p.id === activeProject.id ? { ...p, tomlOverride: null } : p
          );
          saveCurrentProjects(next);
        }}
        onSelectScript={(index) => setEditing({ kind: "script", index })}
        onStartRename={(index, path) => {
          setRenaming(index);
          setRenameValue(path);
        }}
        onRenameValueChange={setRenameValue}
        onCommitRename={handleCommitRename}
        onCancelRename={() => setRenaming(null)}
        onRemoveScript={handleRemoveScript}
        onEditorUpdate={updateContent}
      />

      {/* Action Bar */}
      <ScriptWorkspaceActions
        compiling={compiling}
        scriptsLength={activeProject.files.length}
        result={result}
        sourceBytes={sourceBytes}
        onCompile={handleCompile}
        onImport={handleImport}
        onExport={handleExport}
        onLoadTemplate={handleLoadTemplate}
        onCopyAiPrompt={handleCopyAiPrompt}
        copiedAi={copiedAi}
      />

      {/* Diagnostics */}
      <ScriptDiagnostics
        ownDiagnostics={ownDiagnostics}
        output={output}
        error={error}
        notice={notice}
        onSelectScript={(path) => {
          const idx = activeProject.files.findIndex((f) => f.path === path);
          if (idx >= 0) setEditing({ kind: "script", index: idx });
        }}
      />
    </div>
  );
}
