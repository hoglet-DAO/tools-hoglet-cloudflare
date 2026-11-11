"use client";

import { useState, useEffect, useRef } from "react";
import { Plus, Trash2, ClipboardPaste, List, Code2, Check } from "lucide-react";
import { parseVectorString } from "@/utils/moveParser";

interface VectorInputProps {
  value: string;
  onChange: (val: string) => void;
  disabled: boolean;
  focusColorClass: string;
  paramType: string;
}

export function VectorInput({ 
  value, 
  onChange, 
  disabled, 
  focusColorClass, 
  paramType 
}: VectorInputProps) {
  // Parse initial value into string[]
  const parseItems = (rawVal: string): string[] => {
    if (!rawVal) return [""];
    const parsed = parseVectorString(rawVal);
    return parsed.length > 0 ? parsed : [""];
  };

  const [items, setItems] = useState<string[]>(parseItems(value));
  const [mode, setMode] = useState<"list" | "raw">("list");
  const [rawText, setRawText] = useState("");
  const [pastedFeedback, setPastedFeedback] = useState<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Sync internal state if external value changes (e.g. from an auto-fill button or preset)
  useEffect(() => {
    if (!value) {
      if (items.length !== 1 || items[0] !== "") {
        setItems([""]);
      }
      return;
    }
    const parsed = parseItems(value);
    if (JSON.stringify(parsed) !== JSON.stringify(items.filter(i => i.trim() !== ""))) {
      setItems(parsed.length > 0 ? parsed : [""]);
    }
  }, [value]);

  const updateItems = (newItems: string[]) => {
    setItems(newItems);
    const clean = newItems.filter(i => i.trim() !== "");
    onChange(clean.length > 0 ? JSON.stringify(clean) : "");
  };

  const handleItemChange = (idx: number, newVal: string) => {
    // If user pasted or typed JSON array / multi-line directly into this item
    const parsed = parseVectorString(newVal);
    if (parsed.length > 1 || (parsed.length === 1 && (newVal.trim().startsWith("[") || newVal.trim().startsWith("\"")))) {
      if (items.length <= 1 && (!items[0] || items[0].trim() === "")) {
        updateItems(parsed);
      } else {
        const next = [...items];
        next.splice(idx, 1, ...parsed);
        updateItems(next);
      }
      return;
    }

    const next = [...items];
    next[idx] = newVal;
    updateItems(next);
  };

  const handleItemPaste = (e: React.ClipboardEvent<HTMLInputElement>, idx: number) => {
    const text = e.clipboardData.getData("text");
    if (!text) return;
    const parsed = parseVectorString(text);
    if (parsed.length > 1 || (parsed.length === 1 && (text.trim().startsWith("[") || text.trim().startsWith("\"")))) {
      e.preventDefault();
      if (items.length <= 1 && (!items[0] || items[0].trim() === "")) {
        updateItems(parsed);
      } else {
        const next = [...items];
        next.splice(idx, 1, ...parsed);
        updateItems(next);
      }
      setPastedFeedback(parsed.length);
      setTimeout(() => setPastedFeedback(null), 2500);
    }
  };

  const handleQuickPaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      const parsed = parseVectorString(text);
      if (parsed.length > 0) {
        updateItems(parsed);
        setRawText(JSON.stringify(parsed, null, 2));
        setPastedFeedback(parsed.length);
        setTimeout(() => setPastedFeedback(null), 2500);
      }
    } catch {
      // Fallback: switch to raw mode so user can paste with Ctrl+V
      setRawText(JSON.stringify(items.filter(i => i.trim() !== ""), null, 2));
      setMode("raw");
    }
  };

  const handleRawChange = (text: string) => {
    setRawText(text);
    if (text.trim() === "[]") {
      setItems([]);
      onChange("[]");
      return;
    }
    const parsed = parseVectorString(text);
    setItems(parsed.length > 0 ? parsed : [""]);
    onChange(parsed.length > 0 ? JSON.stringify(parsed) : "");
  };

  const handleAddItem = () => {
    updateItems([...items, ""]);
    // Auto scroll down to newly added item
    setTimeout(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      }
    }, 50);
  };

  const handleRemoveItem = (idx: number) => {
    const next = items.filter((_, i) => i !== idx);
    updateItems(next.length === 0 ? [""] : next);
  };

  const handleClearAll = () => {
    setItems([""]);
    setRawText("");
    onChange("");
  };

  const innerMatch = paramType.match(/vector<(.*)>/);
  const innerType = innerMatch ? innerMatch[1].trim() : "value";
  const validItems = items.filter(i => i.trim() !== "");
  const itemCount = validItems.length;

  return (
    <div className="space-y-2">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-1 text-xs">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono text-[10px] border border-zinc-700/60 shadow-inner">
            {itemCount} {itemCount === 1 ? "item" : "items"}
          </span>
          {pastedFeedback !== null && (
            <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium animate-pulse">
              <Check className="w-3.5 h-3.5" /> Pasted {pastedFeedback} items!
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          {/* Quick Paste Array Button */}
          <button
            type="button"
            disabled={disabled}
            onClick={handleQuickPaste}
            className="px-2.5 py-1 rounded-md bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 transition-all flex items-center gap-1.5 text-[11px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_10px_rgba(6,182,212,0.1)]"
            title="Paste JSON array or list directly from clipboard"
          >
            <ClipboardPaste className="w-3.5 h-3.5" />
            <span>Paste Array</span>
          </button>

          {/* Mode Switcher */}
          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-md p-0.5">
            <button
              type="button"
              onClick={() => setMode("list")}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors flex items-center gap-1 ${
                mode === "list" 
                  ? "bg-zinc-700 text-white shadow-sm" 
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <List className="w-3 h-3" /> List
            </button>
            <button
              type="button"
              onClick={() => {
                setRawText(JSON.stringify(items.filter(i => i.trim() !== ""), null, 2));
                setMode("raw");
              }}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors flex items-center gap-1 ${
                mode === "raw" 
                  ? "bg-zinc-700 text-white shadow-sm" 
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Code2 className="w-3 h-3" /> Raw / JSON
            </button>
          </div>

          {/* Clear button */}
          {(itemCount > 0 || items[0] !== "") && (
            <button
              type="button"
              disabled={disabled}
              onClick={handleClearAll}
              className="p-1 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors disabled:opacity-50"
              title="Clear all items"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {mode === "raw" ? (
        <div className="space-y-1.5">
          <textarea
            rows={Math.min(12, Math.max(6, (rawText.split("\n").length || 1) + 1))}
            disabled={disabled}
            className={`w-full bg-black/60 border border-white/10 rounded-lg p-3 font-mono text-xs text-white focus:outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed ${focusColorClass}`}
            placeholder={`[
  "0x123...",
  "0x456..."
]
// Or paste newline or comma-separated items`}
            value={rawText}
            onChange={(e) => handleRawChange(e.target.value)}
          />
          <div className="flex items-center justify-between text-[11px] text-zinc-400 px-1">
            <span className="text-zinc-500">Paste JSON array, comma-separated, or newline list</span>
            <span className="text-zinc-400 font-mono">{itemCount} items parsed</span>
          </div>
        </div>
      ) : (
        <>
          <div 
            ref={scrollContainerRef}
            className={`space-y-2 ${items.length > 5 ? "max-h-72 overflow-y-auto pr-1" : ""}`}
          >
            {items.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 relative group">
                <div className="absolute left-3 text-[11px] font-mono font-bold text-gray-500 w-5 text-center select-none pointer-events-none">
                  {idx}
                </div>
                <input 
                  type="text" 
                  disabled={disabled}
                  className={`w-full bg-black/50 border border-white/10 rounded-lg pl-10 pr-10 py-2.5 text-xs sm:text-sm font-mono text-white focus:outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed ${focusColorClass}`}
                  placeholder={`Enter ${innerType}... (or paste JSON array)`}
                  value={item}
                  onChange={(e) => handleItemChange(idx, e.target.value)}
                  onPaste={(e) => handleItemPaste(e, idx)}
                />
                {items.length > 1 && (
                  <button 
                    type="button"
                    disabled={disabled}
                    onClick={() => handleRemoveItem(idx)}
                    className="absolute right-2 p-1.5 text-gray-500 hover:text-amm-red hover:bg-amm-red/10 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Remove item"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              disabled={disabled}
              onClick={handleAddItem}
              className="flex items-center gap-1.5 text-xs font-bold text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Item
            </button>
            <span className="text-[10px] text-zinc-500 italic hidden sm:inline">
              Tip: Paste a JSON array or newline list directly into any item box
            </span>
          </div>
        </>
      )}
    </div>
  );
}
