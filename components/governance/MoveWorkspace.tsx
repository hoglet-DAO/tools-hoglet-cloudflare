"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Code2,
  Copy,
  Download,
  FlaskConical,
  ExternalLink,
  FileCode2,
  FilePlus2,
  FileText,
  FolderOpen,
  Info,
  Loader2,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { compileInBrowser, testInBrowser } from "@/lib/move/compileBrowser";
import type { IncludedArtifacts } from "@/lib/move/compileService";
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
  starterModule,
  STARTER_VARIANTS,
  type ProjectSummary,
  type StarterVariant,
  validateToml,
  type MoveModule,
  type MoveProject,
  type SaveFailureReason,
} from "@/lib/move/project";
import { createZip } from "@/lib/move/zip";
import { MoveEditor } from "./MoveEditor";
import { useGovernanceAuditContext } from "@/components/governance/GovernanceAuditContext";
import { parseDiagnostics, stripAnsi, summarizeTests, type TestSummary } from "@/lib/move/diagnostics";
import { Link } from "@/i18n/navigation";
import { useNetwork } from "@/context/NetworkContext";
import { getExplorerUrl } from "@/utils/supra/explorerUtils";
import { WorkspaceIdentity } from "./workspace/WorkspaceIdentity";
import { WorkspaceFileTree } from "./workspace/WorkspaceFileTree";
import { WorkspaceActions } from "./workspace/WorkspaceActions";
import { WorkspaceDiagnostics } from "./workspace/WorkspaceDiagnostics";

/**
 * The authoring half of a deploy: a small file tree plus a compile step.
 *
 * One project maps to one package maps to one deployment. The autosaved project is keyed by the CREATOR,
 * not by the deployment address, and that is forced by the label-based derivation: the address is now a
 * function of the package name, so keying by address would require the name to load the project that
 * contains the name. The creator is known before anything is read, which breaks the circle.
 *
 * It also matches how the tool is used: the workspace edits one package at a time for the account that is
 * connected.
 *
 * `Move.toml` is generated and shown for reference, for the reason in `lib/move/project`: the named address
 * must match where the package is published, and the toolchain will not tell you that until after a rejected
 * transaction.
 */

/* Row states kept as named constants so the two branches cannot be read as applying at once. */
const ACTIVE_ROW_CLS = "bg-emerald-500/10 text-emerald-200";
const INACTIVE_ROW_CLS = "text-gray-400 hover:bg-white/5";

export function MoveWorkspace({
  creator,
  onArtifacts,
  onTarget,
  onLabel,
}: {
  creator: string;
  /** Receives the compiled artifacts in the shape the deploy form consumes. */
  onArtifacts: (a: { metadataHex: string; modules: { name: string; hex: string }[] } | null) => void;
  /** Reports the deployment target, so the deploy form can guard against a taken address. */
  onTarget: (address: string) => void;
  /**
   * Reports the deployment label, which is the package name.
   *
   * The deploy entry point takes it as its first argument — the contract derives the Resource Account from
   * `(creator, label)` — and the name is edited here, so this is the only component that can supply it.
   * Empty when the name is unusable, which the deploy form already treats as a blocker.
   *
   * Optional because the upgrade path does not send it: the account already exists, so there is no label to
   * derive anything from.
   */
  onLabel?: (label: string) => void;
}) {
  const t = useTranslations("Governance");
  const { network } = useNetwork();
  const { rpcUrl, predictResourceAccount } = useGovernanceAuditContext();
  const key = useMemo(() => (creator || "unbound").toLowerCase(), [creator]);

  const [name, setName] = useState("my_package");
  /**
   * The label the address derives from, when it should differ from the package name.
   *
   * The factory hashes `(creator, label)` to pick the Resource Account, and the app has always used the
   * package name as that label. Keeping a separate, persisted override lets a project hold the same address
   * across a rename — or match the address already deployed on another network — without renaming the
   * package. Empty means "use the name".
   */
  const [seed, setSeed] = useState("");
  const [modules, setModules] = useState<MoveModule[]>([]);
  /**
   * The creator's projects, and which one is open.
   *
   * A list rather than a single package because a creator deploys one package per name, and each name is a
   * separate Resource Account. Keeping only the last one dropped the earlier labels — which is the only
   * local record of which label produced which address.
   */
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [activeId, setActiveId] = useState("");
  /** Derived from `(creator, name)`. Empty until the view answers, or when the name is unusable. */
  const [target, setTarget] = useState("");
  const [active, setActive] = useState(0);
  const [newPath, setNewPath] = useState("");
  const [adding, setAdding] = useState(false);
  /** Path currently being renamed, or null. Renaming an entry needs the old path to find it. */
  const [renaming, setRenaming] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");

  /**
   * Edited `Move.toml`, or null while the generated one is in force.
   *
   * Editable because extra `[dependencies]` blocks are the only way to import a third-party package, and
   * the compile service resolves them. Not editable-by-default because the named address is what the
   * toolchain bakes into the bytecode, so the generated value is the one that deploys.
   */
  const [tomlOverride, setTomlOverride] = useState<string | null>(null);
  /** Which file the editor is showing: the manifest, or a module by index. */
  const [editing, setEditing] = useState<{ kind: "toml" } | { kind: "module"; index: number }>({
    kind: "module",
    index: 0,
  });

  const [compiling, setCompiling] = useState(false);
  const [testing, setTesting] = useState(false);
  /**
   * Advanced compile options, surfaced in the workspace and unset by default.
   *
   * Empty / false means "send nothing": the compile is the normal one. `includedArtifacts` (e.g. `none`)
   * trims the on-chain package metadata for a large package, and `overrideSizeCheck` asks the service to
   * return the artifacts past its size cap. Both are compile-only, so they sit with the compile state.
   */
  const [includedArtifacts, setIncludedArtifacts] = useState<IncludedArtifacts | "">("");
  const [overrideSizeCheck, setOverrideSizeCheck] = useState(false);
  const [testResult, setTestResult] = useState<TestSummary | null>(null);
  const [result, setResult] = useState<{ ok: boolean; modules: string[]; ms: number; cached: boolean } | null>(null);
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  /**
   * Non-blocking feedback, kept apart from `error`.
   *
   * An import that succeeds but leaves a few files out is not a failure, so it does not belong in the red
   * error box — that made a working import read as a broken one. It shows as a quiet note instead.
   */
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  /** Autosave outcome, so a failure is visible instead of silent. */
  const [saveState, setSaveState] = useState<"idle" | "saved" | SaveFailureReason>("idle");
  const loaded = useRef<string | null>(null);
  /**
   * The last committed package name.
   *
   * Needed because a rename has to rewrite the sources, and the rewrite is `from -> to`. Reading `name`
   * from state would give the new value on both sides, so the previous value has to be remembered
   * somewhere the render cycle cannot race.
   */
  const lastName = useRef("my_package");
  /** Hidden picker driven by the Import button. */
  const importInput = useRef<HTMLInputElement>(null);
  /**
   * The same picker without `webkitdirectory`, for when the folder picker misbehaves.
   *
   * `webkitdirectory` is non-standard and has been seen to hand back an empty selection for a folder that
   * plainly contains the files — intermittently, by browser and version. That left the user with no way
   * forward at all, so there is a second, ordinary multi-file picker beside it.
   */
  const fileInput = useRef<HTMLInputElement>(null);
  /**
   * Whether the workspace itself supplied the deploy artifacts.
   *
   * It does not, today: the compile service returns ModuleIDs rather than bytecode, so the bytecode is
   * supplied by the manual upload instead. Calling `onArtifacts(null)` unconditionally on every edit and
   * on every compile wiped that upload — so compiling, or touching a file after uploading, silently
   * cleared the form and the deploy button could never become enabled.
   *
   * Once the service returns artifacts this flips to true and the invalidation starts doing its job:
   * editing a source must invalidate the bytes compiled from it.
   */
  const suppliedArtifacts = useRef(false);

  /** Clears the artifacts only when this workspace is what put them there. */
  const invalidateOwnArtifacts = useCallback(() => {
    if (suppliedArtifacts.current) onArtifacts(null);
  }, [onArtifacts]);

  /**
   * Creates a project and returns it, so the caller can put it at the head of the list.
   *
   * Written immediately rather than left in memory for the autosave. The selector reads the index, so a
   * project that exists only in state would be missing from it until something else triggered a save — and
   * a reload before then would lose the project entirely.
   */
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

  // Rebuilt whenever the creator changes: the projects belong to one account, so switching wallets has to
  // show that account's packages rather than carry the previous account's across.
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

  // Load once per project. Ref rather than state so a re-render cannot re-read and clobber edits that were
  // typed before the first effect ran.
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
    // Probed up front so the warning appears before anything is typed. Waiting for the first autosave to
    // fail would tell the user only after they had work worth losing.
    setSaveState(canPersist() ? "idle" : "blocked");
    invalidateOwnArtifacts();
  }, [key, activeId, invalidateOwnArtifacts]);

  useEffect(() => {
    if (!activeId || loaded.current !== `${key}:${activeId}`) return;
    const t = setTimeout(() => {
      // The result is no longer discarded: a failed autosave is surfaced, because an editor that loses
      // work without saying so is worse than one that cannot save at all.
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
      // The selector reads names from the index, so a rename has to be reflected there too. Returning the
      // same array when nothing changed keeps this from re-rendering on every autosave.
      setProjects((prev) => {
        const cur = prev.find((p) => p.id === activeId);
        return !cur || cur.name === name ? prev : prev.map((p) => (p.id === activeId ? { ...p, name } : p));
      });
    }, 400);
    return () => clearTimeout(t);
  }, [key, activeId, name, seed, modules, target, tomlOverride]);

  /** Adds an empty project, named so it cannot collide with an existing label. */
  const addProject = useCallback(() => {
    const created = startProject(nextProjectName(projects.map((p) => p.name)));
    setProjects((prev) => [created, ...prev]);
    setActiveId(created.id);
  }, [startProject, projects]);

  /**
   * Deletes the open project.
   *
   * The last one is replaced rather than left empty: the workspace always edits something, and an empty
   * selector would be a dead end with no way back.
   */
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

  /**
   * The explorer page for the deployment target.
   *
   * Network-aware rather than a hardcoded host: testnet and mainnet are different explorers, and a link
   * that always pointed at one of them would send half the users to a page that cannot find the address.
   * Null when the helper does not know the network, so the button is hidden instead of broken.
   */
  const explorerUrl = useMemo(
    () => (target ? getExplorerUrl(network, "address", target) : null),
    [network, target]
  );
  const nameOk = isValidPackageName(name);
  /**
   * The label the address derives from: the seed when set, otherwise the package name.
   *
   * Held to the same identifier rule as the package name, deliberately. The chain would accept any bytes up
   * to 64, but the label has always been the package name, so anything that is not a valid package name can
   * only be a typo or a confusable string — and it would quietly derive an address no one can reproduce.
   * Validating here keeps the two fields interchangeable and the address explainable.
   */
  const label = seed.trim() || name;
  const labelOk = isValidPackageName(label);
  const activeIndex = editing.kind === "module" ? Math.min(editing.index, modules.length - 1) : 0;
  const current = modules[activeIndex];

  /**
   * Reports the label on its own, not alongside the target.
   *
   * The two are computed together but are needed independently: the deploy call takes the label as an
   * argument whether or not the address view answered, and gating it on the prediction would leave the
   * deploy unable to build its arguments during a view outage that the deploy itself would survive.
   */
  useEffect(() => {
    onLabel?.(labelOk ? label : "");
  }, [label, labelOk, onLabel]);

  /**
   * The deployment target: a Resource Account derived from `(creator, label)`.
   *
   * The label is the seed when one is set, otherwise the package name. A chosen string rather than a random
   * value, deliberately: the address must be known *before* the package is compiled — the manifest binds it
   * as the module's self address — so it has to be reproducible from something the user still has.
   *
   * Consequence worth knowing: the label is what selects the account, so changing the seed (or, with no seed,
   * renaming the package) targets a different account. That is the honest reading of a rename — a different
   * package, not a redeploy of the old one — and the seed is what lets an address be pinned across one.
   */
  useEffect(() => {
    if (!rpcUrl || !creator || !labelOk) {
      setTarget("");
      onTarget("");
      return;
    }
    let live = true;
    // Debounced: the name changes on every keystroke and each derivation is a network view, so without this
    // a five-letter package name fires five calls, four of them already stale by the time they land.
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

  /**
   * Renames the package, and carries the rename into everything that names it.
   *
   * Sources declare `module <package>::<name>`, so changing the package without rewriting them left the
   * project declaring a named address that no longer existed — the form showed the new name while the code
   * still referred to the old one, and the package stopped compiling. The edited manifest is rewritten too,
   * or it would keep binding the old address key.
   *
   * Applied per keystroke against the previous value rather than on blur: the rename is incremental, so
   * `my_package` -> `my_packag` -> `my_packa` composes correctly and the user sees the effect as they type.
   */
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

  /**
   * Imports a package from the file system.
   *
   * The address is deliberately left as the derived one rather than taken from the imported manifest: the
   * deployment target is a function of the connected account and cannot be chosen. An imported manifest
   * compiled for a different address therefore shows the mismatch in the validation box instead of being
   * silently accepted, which is the honest outcome — that package cannot deploy to this account.
   */
  const handleImport = useCallback(
    async (picked: FileList | null, source: "folder" | "files") => {
      setError(null);
      setNotice(null);
      /*
        The previous project's compile and test badges are dropped before anything else.

        They described sources that are being replaced, and clearing them only on the success path left
        them on screen whenever an import came back empty or was rejected — the "already compiled" pill
        then read as if the new folder had been the one compiled, which is exactly the wrong conclusion.
        A fresh selection is a fresh project, so nothing older than it should survive to describe it.
      */
      setResult(null);
      setTestResult(null);
      if (!picked?.length) {
        /*
          The folder picker came back empty. `webkitdirectory` has been seen to do that for a folder that
          plainly holds the files — intermittently, by browser and version — so rather than hand the user a
          dead-end message, the plain picker opens straight away. One button, and the fallback is automatic.

          Called synchronously, before any `await`, so it still runs inside the change event's user
          activation. Opening a picker from a later tick is the thing browsers refuse.
        */
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
        // The workspace's own name is the fallback when the selection carries no manifest, which is what
        // importing a bare `sources/` tree or a handful of files looks like.
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
    // Accept a bare module name or a full path. Requiring `sources/Name.move` made the most common case
    // — one new module — the most tedious one to type, and the `sources/` prefix is not a choice the
    // user is making: every module goes there by definition.
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

  /**
   * Renames the file and moves the module declaration with it.
   *
   * The toolchain treats the file name as cosmetic — it compiles a mismatched pair without complaint —
   * so renaming only the path would leave the tree showing `Pool.move` while the published ModuleID still
   * said `example`. Keeping them together is what makes the visible name trustworthy.
   */
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

  /**
   * Downloads the project as a `.zip`.
   *
   * The archive is built from the same `projectToFiles` the compiler uses, so what lands on disk is
   * exactly what was compiled. Without this the only way to get the code out of the browser was to copy
   * each file by hand, which made autosave the single copy of the user's work.
   */
  const handleExport = useCallback(() => {
    setError(null);
    try {
      const entries = projectToExportFiles({ ...project, modules });
      const zip = createZip(entries);
      // `slice()` because the writer's buffer may be a view over a larger ArrayBuffer, and Blob would
      // then include the unused tail.
      const blob = new Blob([zip.slice().buffer as ArrayBuffer], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name || "move-package"}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoked on the next tick: revoking synchronously can cancel the download in some browsers.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (e: any) {
      setError(e?.message || "could not build the archive");
    }
  }, [project, modules, name]);

  /**
   * Runs the package's `#[test]` functions on the service.
   *
   * Output goes to the same pane as a compile, so diagnostics land in the same list. The verdict is read
   * from stdout rather than the exit code: `supra move tool test` reports `Test result: OK` or `FAILED`
   * there, and a suite with failing tests still exits successfully often enough that trusting the code
   * alone would show a green result for red tests.
   */
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

  /**
   * Starts over from one of the templates.
   *
   * Replaces what the Reset button did, with the choice the reset was missing: one template cannot suit
   * both a reader who wants two functions and one who wants an entry to send a transaction to. The choice
   * persists through the autosave like any other edit, so reopening keeps whichever was picked.
   */
  const loadTemplate = useCallback(
    (variant: StarterVariant) => {
      // The name is kept, not reset to `my_package`. It is the label the address derives from, so resetting
      // it would silently move the deployment target of a project the user had already named and possibly
      // already deployed — from a button whose label says "template".
      const pkg = isValidPackageName(name) ? name : "my_package";
      setModules([starterModule(pkg, variant)]);
      setEditing({ kind: "module", index: 0 });
      setTomlOverride(null);
      setSeed("");
      setResult(null);
      setOutput("");
      setError(null);
      setNotice(null);
      setSaveState(canPersist() ? "idle" : "blocked");
      invalidateOwnArtifacts();
    },
    [name, invalidateOwnArtifacts]
  );

  const handleCompile = useCallback(async () => {
    setError(null);
    setCompiling(true);
    setOutput("");
    const res = await compileInBrowser(projectToFiles({ ...project, modules }), {
      includedArtifacts: includedArtifacts || undefined,
      overrideSizeCheck,
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

    setResult({ ok: true, modules: res.modules, ms: res.ms, cached: res.cached });

    /**
     * Hand over the bytes, so deploying is a click rather than a file hunt.
     *
     * `metadata` and `bytecode` are exactly the `metadata_serialized` and `code` arguments of
     * `code::publish_package`, produced by the same compile that just ran — so what gets published is by
     * construction what was compiled and reviewed here.
     *
     * Marking the artifacts as ours is what arms `invalidateOwnArtifacts`: editing a source afterwards has
     * to drop bytes that no longer describe it, or a stale package would deploy silently.
     *
     * When the service reports `artifacts_omitted` there is nothing to hand over, and the manual upload
     * remains the way through — which is why this falls back rather than failing.
     */
    if (res.metadata && res.bytecode.length === res.modules.length && res.bytecode.length > 0) {
      suppliedArtifacts.current = true;
      onArtifacts({
        metadataHex: res.metadata,
        modules: res.bytecode.map((hex, i) => ({ name: moduleLabel(res.modules[i], i), hex })),
      });
    } else {
      invalidateOwnArtifacts();
      // The service ran the compiler but could not return the bytes, so the compile itself succeeded and
      // only the handover failed. Saying so matters: the green badge above claims success, and without this
      // the disabled deploy button would look like a contradiction.
      if (res.artifactsOmitted) setError(t("workspaceArtifactsOmitted"));
    }

    // The service's own note about a large package, shown verbatim: it knows the size it built and what to
    // do about it, and paraphrasing it here would only drift from it.
    setNotice(res.hint ?? null);
  }, [project, modules, t, invalidateOwnArtifacts, onArtifacts, includedArtifacts, overrideSizeCheck]);

  // Split by origin: the framework's own diagnostics are noise the service documents as such, while the
  // user's own are the only ones worth placing next to their code.
  const diagnostics = useMemo(
    () => (output ? parseDiagnostics(output, modules.map((m) => m.path)) : []),
    [output, modules]
  );
  const ownDiagnostics = useMemo(() => diagnostics.filter((d) => !d.external), [diagnostics]);
  const externalDiagnostics = useMemo(() => diagnostics.filter((d) => d.external), [diagnostics]);

  /**
   * The project selector.
   *
   * Kept outside the target guard below on purpose: an unusable package name blanks the target, and if the
   * selector lived behind that guard the one state where the user most needs to switch away from a project
   * would be the one state where they could not.
   */
  const projectBar = (
    <div className="mb-3 flex flex-wrap items-end gap-2 border-b border-white/10 pb-3">
      <label className="min-w-0 flex-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
          {t("workspaceProject")}
        </span>
        <select
          value={activeId}
          onChange={(e) => setActiveId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2.5 py-2 text-[12px] text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/40"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id} className="bg-gray-900">
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={addProject}
        title={t("workspaceProjectNew")}
        className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[11px] text-gray-300 transition-colors hover:bg-white/[0.07] hover:text-white"
      >
        <Plus className="w-3.5 h-3.5" />
        {t("workspaceProjectNew")}
      </button>
      <button
        type="button"
        onClick={removeProject}
        title={t("workspaceProjectDelete")}
        aria-label={t("workspaceProjectDelete")}
        className="rounded-lg border border-white/10 bg-white/[0.03] p-2 text-gray-400 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );

  if (!target) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
        {projectBar}
        <div className="rounded-lg border border-amber-400/25 bg-amber-500/[0.07] px-3 py-2.5 text-[11px] text-amber-100">
          {t("workspaceNeedAddress")}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      {projectBar}
      {/* Package identity */}
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

      {/* File tree */}
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

      {/* Compile and actions toolbar */}
      <WorkspaceActions
        t={t}
        compiling={compiling}
        testing={testing}
        nameOk={nameOk}
        modulesLength={modules.length}
        result={result}
        testResult={testResult}
        onCompile={handleCompile}
        onTest={handleTest}
        onImport={handleImport}
        onExport={handleExport}
        onLoadTemplate={loadTemplate}
        includedArtifacts={includedArtifacts}
        onIncludedArtifactsChange={setIncludedArtifacts}
        overrideSizeCheck={overrideSizeCheck}
        onOverrideSizeCheckChange={setOverrideSizeCheck}
      />

      {/* Diagnostics and output */}
      <WorkspaceDiagnostics
        t={t}
        ownDiagnostics={ownDiagnostics}
        externalDiagnostics={externalDiagnostics}
        output={output}
        error={error}
        notice={notice}
        saveState={saveState}
        onSelectModule={(path) => {
          const i = modules.findIndex((m) => m.path === path);
          if (i >= 0) setEditing({ kind: "module", index: i });
        }}
      />
    </div>
  );
}