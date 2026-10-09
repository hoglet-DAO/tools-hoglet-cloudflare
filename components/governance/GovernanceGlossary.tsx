import { Info } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Glossary for the protocol words the prose deliberately avoids.
 *
 * Every string in the Governance namespace is written so a reader never has to know a term before it
 * tells them anything: "hand control to a DAO" instead of "donate an EOA through a revocable proxy".
 * The cost is that the words themselves disappear, and someone reading the source, the Move entry
 * points or the block explorer still needs to map them back. This panel carries that mapping, so the
 * plain text never has to interrupt itself to define jargon.
 */
const TERMS = [
  // The most common point of confusion: people assume an address and an account are different things.
  { label: "EOA", termKey: "termEoa" },
  // The field is labelled "contract owner" so it says what it decides; the chain, the explorer and the Move
  // entry points all call the same thing `admin`, so the two names are tied together here.
  { label: "Admin", termKey: "termAdmin" },
  { label: "Renounce", termKey: "termRenounce" },
  { label: "Capability", termKey: "termCapability" },
  { label: "Immutable", termKey: "termImmutable" },
] as const;

export default function GovernanceGlossary() {
  const t = useTranslations("Governance");

  return (
    <details className="group rounded-xl border border-white/10 bg-white/[0.02]">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[11px] font-bold text-gray-300 transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-emerald-300/50">
        <Info className="h-3.5 w-3.5 shrink-0 text-gray-500" />
        {t("glossaryTitle")}
      </summary>
      <dl className="space-y-3 border-t border-white/10 px-4 py-3.5">
        {TERMS.map(({ label, termKey }) => (
          <div key={termKey}>
            <dt className="font-mono text-[11px] font-bold text-emerald-300">{label}</dt>
            <dd className="mt-0.5 text-[11px] leading-relaxed text-gray-400">{t(termKey)}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}