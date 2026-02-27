import { X } from "lucide-react";
import { useState } from "react";

export function DownloadMonitor() {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) return null;

  return (
    <div className="bg-zinc-900/80 backdrop-blur-md border border-zinc-700 rounded-lg shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-800/50 border-b border-zinc-700">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
          <span className="text-sm font-medium text-white">Downloads</span>
        </div>
        <button
          type="button"
          onClick={() => setIsVisible(false)}
          className="text-zinc-400 hover:text-white transition-colors p-1"
        >
          <X size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="space-y-3">
          {/* Download Item */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-zinc-300">Minecraft 1.20.4</span>
              <span className="text-zinc-400">65%</span>
            </div>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                style={{ width: "65%" }}
              ></div>
            </div>
            <div className="flex justify-between text-[10px] text-zinc-500">
              <span>142 MB / 218 MB</span>
              <span>2.1 MB/s • 36s remaining</span>
            </div>
          </div>

          {/* Download Item */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-zinc-300">Java 17</span>
              <span className="text-zinc-400">100%</span>
            </div>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full"></div>
            </div>
            <div className="text-[10px] text-emerald-400">Completed</div>
          </div>
        </div>
      </div>
    </div>
  );
}
