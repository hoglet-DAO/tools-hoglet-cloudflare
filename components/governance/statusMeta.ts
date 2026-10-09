import { Lock, ShieldAlert, ShieldCheck, Unlock } from "lucide-react";
import { EOA_SECURITY_STATUS, type LifecycleStage } from "@/hooks/features/governance/useGovernanceAudit";

/**
 * Presentation metadata for the four on-chain control states.
 *
 * Split out of the hub because both the read panel and any future surface need it, and because a
 * status is a *fact about the chain* rather than a property of one screen: the same color, icon and
 * voice must appear wherever a verdict is shown, or the same state would read as two different ones.
 */
export const STATUS_META = {
  [EOA_SECURITY_STATUS.UNMANAGED]: {
    icon: Unlock,
    accent: "text-zinc-400",
    wash: "bg-zinc-500/10",
    edge: "border-zinc-400/25",
    glow: "",
    key: "statusUnmanaged",
  },
  [EOA_SECURITY_STATUS.PERMANENTLY_RENOUNCED]: {
    icon: Lock,
    accent: "text-emerald-400",
    wash: "bg-emerald-500/10",
    edge: "border-emerald-400/35",
    glow: "shadow-[0_0_50px_-12px_rgba(16,185,129,0.45)]",
    key: "statusRenounced",
  },
  [EOA_SECURITY_STATUS.VERIFIED_DAO_GOVERNED]: {
    icon: ShieldCheck,
    accent: "text-cyan-300",
    wash: "bg-cyan-400/10",
    edge: "border-cyan-300/35",
    glow: "shadow-[0_0_50px_-12px_rgba(34,211,238,0.4)]",
    key: "statusDaoGoverned",
  },
  [EOA_SECURITY_STATUS.HAZARD_KEY_STILL_ACTIVE]: {
    icon: ShieldAlert,
    accent: "text-rose-300",
    wash: "bg-rose-500/15",
    edge: "border-rose-400/50",
    glow: "shadow-[0_0_60px_-10px_rgba(244,63,94,0.55)]",
    key: "statusHazard",
  },
} as const;

/** Stage -> translation key, so the stage label is derived rather than picked per surface. */
export const STAGE_KEY: Record<LifecycleStage, string> = {
  unmanaged: "stage_unmanaged",
  dual_master: "stage_dual_master",
  governed: "stage_governed",
  frozen: "stage_frozen",
};