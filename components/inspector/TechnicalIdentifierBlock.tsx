import { ExternalLink, Copy, Check } from "lucide-react";

interface TechnicalIdentifierBlockProps {
  typeString: string;
  getExplorerLink: (typeString: string) => string;
  shortenType: (typeStr: string) => string;
  copiedType: string | null;
  handleCopy: (e: React.MouseEvent, text: string) => void;
}

export const TechnicalIdentifierBlock = ({ 
  typeString, 
  getExplorerLink, 
  shortenType, 
  copiedType, 
  handleCopy 
}: TechnicalIdentifierBlockProps) => {
  if (!typeString?.includes('::')) {
    return (
      <div className="bg-black/30 rounded-lg p-3 font-mono text-xs text-gray-400 border border-white/5">
        <div className="flex justify-between items-center">
          <span className="text-gray-500">Token Object</span>
          <a 
            href={getExplorerLink(typeString)} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-amm-pink hover:text-white hover:underline flex items-center gap-1" 
          >
            {shortenType(typeString)}
            <ExternalLink className="w-3 h-3 opacity-50" />
          </a>
        </div>
      </div>
    );
  }

  const parts = typeString.split('::');
  const address = parts[0];
  const module = parts[1];
  const structRaw = parts.slice(2).join('::');
  
  let structName = structRaw;
  let genericPart = "";
  if (structRaw?.includes('<') && structRaw.endsWith('>')) {
    const splitIdx = structRaw.indexOf('<');
    structName = structRaw.substring(0, splitIdx);
    const inside = structRaw.substring(splitIdx + 1, structRaw.length - 1);
    genericPart = `<${shortenType(inside)}>`;
  }

  return (
    <div className="bg-black/30 rounded-xl p-4 font-mono text-xs border border-white/5 shadow-inner">
      {/* Full Identifier */}
      <div className="flex flex-col gap-1.5 mb-4">
        <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Token Identifier</span>
        <button 
          onClick={(e) => handleCopy(e, typeString)} 
          className="group flex items-center justify-between w-full bg-black/40 hover:bg-white/5 px-3 py-2 rounded-lg text-gray-400 hover:text-white text-[10px] sm:text-xs border border-white/5 font-mono transition-colors text-left cursor-pointer"
          title="Click to copy full identifier"
        >
          <span className="truncate pr-4">{shortenType(typeString)}</span>
          <div className="flex-shrink-0 flex items-center">
            {copiedType === typeString ? (
              <Check className="w-3.5 h-3.5 text-green-400" />
            ) : (
              <Copy className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100 transition-opacity" />
            )}
          </div>
        </button>
      </div>

      <div className="pt-4 border-t border-white/5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-b border-white/5 pb-4">
          {/* Address */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Address</span>
            <div className="flex items-center gap-2 bg-white/5 px-2.5 py-1.5 rounded-lg w-fit border border-white/5">
              <a 
                href={`https://suprascan.io/address/${address}`} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-amm-pink hover:text-white hover:underline transition-colors flex items-center gap-1 break-all"
              >
                <span className="truncate sm:whitespace-normal">{shortenType(address)}</span>
                <ExternalLink className="w-3 h-3 opacity-50 flex-shrink-0" />
              </a>
              <button 
                onClick={(e) => handleCopy(e, address)} 
                className="text-gray-500 hover:text-white transition-colors ml-1"
                title="Copy Address"
              >
                {copiedType === address ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
          {/* Module */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Module</span>
            <a 
              href={`https://suprascan.io/address/${address}?tab=modules`} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="bg-white/5 px-2.5 py-1.5 rounded-lg text-white hover:text-cyan-400 w-fit max-w-full border border-white/5 transition-colors flex items-center gap-1"
              title="View Module"
            >
              <span className="truncate">{module}</span>
              <ExternalLink className="w-3 h-3 opacity-50 flex-shrink-0" />
            </a>
          </div>
        </div>
        {/* Struct */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Struct</span>
          <div className="flex items-center gap-2 w-full">
            <a 
              href={getExplorerLink(typeString)} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="inline-flex flex-wrap items-center gap-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 px-3 py-2 rounded-lg transition-colors break-words max-w-full"
            >
              <span className="font-bold break-all">{structName}</span>
              {genericPart && <span className="opacity-60 break-all">{genericPart}</span>}
              <ExternalLink className="w-3.5 h-3.5 flex-shrink-0 opacity-70" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
