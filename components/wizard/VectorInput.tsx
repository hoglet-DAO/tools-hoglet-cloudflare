"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

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
  // Parse initial value if it exists, otherwise start with one empty item
  const initialItems = () => {
    if (!value) return [""];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : [""];
    } catch {
      return [value];
    }
  };

  const [items, setItems] = useState<string[]>(initialItems());

  const updateItems = (newItems: string[]) => {
    setItems(newItems);
    onChange(JSON.stringify(newItems));
  };

  const handleItemChange = (idx: number, newVal: string) => {
    const newItems = [...items];
    newItems[idx] = newVal;
    updateItems(newItems);
  };

  const handleAddItem = () => {
    updateItems([...items, ""]);
  };

  const handleRemoveItem = (idx: number) => {
    const newItems = items.filter((_, i) => i !== idx);
    updateItems(newItems.length === 0 ? [""] : newItems);
  };

  const innerMatch = paramType.match(/vector<(.*)>/);
  const innerType = innerMatch ? innerMatch[1].trim() : "value";

  return (
    <div className="space-y-2">
      {items.map((item, idx) => (
        <div key={idx} className="flex items-center gap-2 relative">
          <div className="absolute left-3 text-xs font-bold text-gray-500 w-4 text-center">
            {idx}
          </div>
          <input 
            type="text" 
            disabled={disabled}
            className={`w-full bg-black/50 border border-white/10 rounded-lg pl-9 pr-10 py-3 text-sm text-white focus:outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed ${focusColorClass}`}
            placeholder={`Enter ${innerType}...`}
            value={item}
            onChange={(e) => handleItemChange(idx, e.target.value)}
          />
          {items.length > 1 && (
            <button 
              type="button"
              disabled={disabled}
              onClick={() => handleRemoveItem(idx)}
              className="absolute right-2 p-1.5 text-gray-500 hover:text-amm-red hover:bg-amm-red/10 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Remove item"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        disabled={disabled}
        onClick={handleAddItem}
        className="mt-2 flex items-center gap-2 text-xs font-bold text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Plus className="w-3 h-3" />
        Add Item
      </button>
    </div>
  );
}
