"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Check, FolderOpen, Loader2, Snowflake } from "lucide-react";
import { formatBytes } from "@/lib/governance/buildArtifacts";

export const inputCls =
  "w-full rounded-lg border border-white/10 bg-black/50 px-3.5 py-2.5 font-mono text-xs text-white placeholder:text-gray-700 focus:border-cyan-300/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/40";

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 sm:p-5">
      {children}
    </div>
  );
}

export function StageHeader({
  icon: Icon,
  title,
  body,
  tone,
}: {
  icon: React.ElementType;
  title: string;
  body: string;
  tone: string;
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="w-11 h-11 shrink-0 rounded-xl border border-white/10 bg-black/30 flex items-center justify-center">
        <Icon className={`w-5 h-5 ${tone}`} />
      </div>
      <div className="min-w-0">
        <p className={`text-sm font-bold ${tone}`}>{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-gray-400">{body}</p>
      </div>
    </div>
  );
}

export function StageNotice({
  icon: Icon,
  title,
  body,
  tone = "text-gray-300",
}: {
  icon: React.ElementType;
  title: string;
  body: string;
  tone?: string;
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="w-11 h-11 shrink-0 rounded-xl border border-white/10 bg-black/30 flex items-center justify-center">
        <Icon className={`w-5 h-5 ${tone}`} />
      </div>
      <div className="min-w-0">
        <p className={`text-lg font-extrabold ${tone}`}>{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-gray-400">{body}</p>
      </div>
    </div>
  );
}

export function SourceTabs({
  source,
  onChange,
  t,
}: {
  source: "code" | "upload";
  onChange: (source: "code" | "upload") => void;
  t: any;
}) {
  const tabCls = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-[11px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/40 ${
      active ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300"
    }`;
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-white/10 bg-black/30 p-0.5">
      <button
        type="button"
        aria-pressed={source === "code"}
        onClick={() => onChange("code")}
        className={tabCls(source === "code")}
      >
        {t("sourceCode")}
      </button>
      <button
        type="button"
        aria-pressed={source === "upload"}
        onClick={() => onChange("upload")}
        className={tabCls(source === "upload")}
      >
        {t("deployManualTitle")}
      </button>
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[11px] text-gray-400">{label}</label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1.5 text-[10px] leading-relaxed text-gray-600">{hint}</p>}
    </div>
  );
}

export function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-lg border border-amber-400/25 bg-amber-500/[0.08] px-3.5 py-3">
      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
      <p className="text-[11px] leading-relaxed text-amber-100/85">{children}</p>
    </div>
  );
}

export function ArtifactPicker({
  t,
  accept,
  multiple,
  label,
  hint,
  onPick,
}: {
  t: any;
  accept: string;
  multiple: boolean;
  label: string;
  hint?: string;
  onPick: (files: File[]) => Promise<void>;
}) {
  const [files, setFiles] = useState<File[]>([]);

  return (
    <Field label={label} hint={hint}>
      <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-white/15 bg-black/30 px-3.5 py-3 transition-colors hover:border-cyan-300/40 hover:bg-black/50 focus-within:ring-2 focus-within:ring-cyan-300/40">
        <FolderOpen className="w-4 h-4 text-gray-500 shrink-0" />
        <span className="text-xs text-gray-400 truncate">
          {files.length === 0
            ? t("pickerIdle")
            : files.length === 1
              ? `${files[0].name} · ${formatBytes(files[0].size)}`
              : t("pickerMany", { count: files.length, size: formatBytes(files.reduce((a, f) => a + f.size, 0)) })}
        </span>
        <input
          type="file"
          accept={accept}
          multiple={multiple}
          className="sr-only"
          onChange={async (e) => {
            const picked = Array.from(e.target.files ?? []);
            if (!picked.length) return;
            setFiles(picked);
            await onPick(picked);
          }}
        />
      </label>
    </Field>
  );
}

export function Form({
  title,
  hint,
  ready,
  pending,
  cta,
  reason,
  tone = "emerald",
  onSubmit,
  children,
}: {
  title: string;
  hint: string;
  ready: boolean;
  pending: boolean;
  cta: string;
  reason?: string;
  tone?: "emerald" | "rose";
  onSubmit: () => void | Promise<unknown>;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border bg-black/20 p-4 ${
        tone === "rose" ? "border-rose-400/20" : "border-white/10"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-white">{title}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-gray-500 break-all">{hint}</p>
        </div>
      </div>

      <div className="mt-4 space-y-3.5">{children}</div>

      <button
        type="button"
        disabled={!ready || pending}
        onClick={onSubmit}
        className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white transition-all disabled:cursor-not-allowed disabled:opacity-35 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-black sm:w-auto ${
          tone === "rose"
            ? "bg-gradient-to-br from-rose-500 to-red-700 hover:from-rose-400 hover:to-red-600 disabled:hover:shadow-none"
            : "bg-gradient-to-br from-emerald-400 to-teal-600 hover:from-emerald-300 hover:to-teal-500"
        } ${tone === "rose" ? "hover:shadow-[0_0_30px_-6px_rgba(244,63,94,0.7)]" : "hover:shadow-[0_0_30px_-6px_rgba(16,185,129,0.6)]"}`}
      >
        {pending ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {cta}…
          </>
        ) : (
          <>
            {tone === "rose" ? <Snowflake className="w-4 h-4" /> : <Check className="w-4 h-4" />}
            {cta}
          </>
        )}
      </button>

      {!ready && reason && (
        <p className="mt-2 text-[11px] leading-relaxed text-amber-200/80">{reason}</p>
      )}
    </motion.div>
  );
}
