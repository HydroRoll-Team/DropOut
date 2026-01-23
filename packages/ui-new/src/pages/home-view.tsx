import { Calendar, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import type { SaturnEffect } from "@/lib/effects/SaturnEffect";
import { useGameStore } from "../stores/game-store";
import { useReleasesStore } from "../stores/releases-store";

export function HomeView() {
  const gameStore = useGameStore();
  const releasesStore = useReleasesStore();
  const [mouseX, setMouseX] = useState(0);
  const [mouseY, setMouseY] = useState(0);

  useEffect(() => {
    releasesStore.loadReleases();
  }, [releasesStore.loadReleases]);

  const handleMouseMove = (e: React.MouseEvent) => {
    const x = (e.clientX / window.innerWidth) * 2 - 1;
    const y = (e.clientY / window.innerHeight) * 2 - 1;
    setMouseX(x);
    setMouseY(y);

    // Forward mouse move to SaturnEffect (if available) for parallax/rotation interactions
    try {
      const saturn = (
        window as unknown as {
          getSaturnEffect?: () => SaturnEffect;
        }
      ).getSaturnEffect?.();
      if (saturn?.handleMouseMove) {
        saturn.handleMouseMove(e.clientX);
      }
    } catch {
      /* best-effort, ignore errors from effect */
    }
  };

  const handleSaturnMouseDown = (e: React.MouseEvent) => {
    try {
      const saturn = (window as any).getSaturnEffect?.();
      if (saturn?.handleMouseDown) {
        saturn.handleMouseDown(e.clientX);
      }
    } catch {
      /* ignore */
    }
  };

  const handleSaturnMouseUp = () => {
    try {
      const saturn = (window as any).getSaturnEffect?.();
      if (saturn?.handleMouseUp) {
        saturn.handleMouseUp();
      }
    } catch {
      /* ignore */
    }
  };

  const handleSaturnMouseLeave = () => {
    // Treat leaving the area as mouse-up for the effect
    try {
      const saturn = (window as any).getSaturnEffect?.();
      if (saturn?.handleMouseUp) {
        saturn.handleMouseUp();
      }
    } catch {
      /* ignore */
    }
  };

  const handleSaturnTouchStart = (e: React.TouchEvent) => {
    if (e.touches && e.touches.length === 1) {
      try {
        const clientX = e.touches[0].clientX;
        const saturn = (window as any).getSaturnEffect?.();
        if (saturn?.handleTouchStart) {
          saturn.handleTouchStart(clientX);
        }
      } catch {
        /* ignore */
      }
    }
  };

  const handleSaturnTouchMove = (e: React.TouchEvent) => {
    if (e.touches && e.touches.length === 1) {
      try {
        const clientX = e.touches[0].clientX;
        const saturn = (window as any).getSaturnEffect?.();
        if (saturn?.handleTouchMove) {
          saturn.handleTouchMove(clientX);
        }
      } catch {
        /* ignore */
      }
    }
  };

  const handleSaturnTouchEnd = () => {
    try {
      const saturn = (window as any).getSaturnEffect?.();
      if (saturn?.handleTouchEnd) {
        saturn.handleTouchEnd();
      }
    } catch {
      /* ignore */
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const escapeHtml = (unsafe: string) => {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  const formatBody = (body: string) => {
    if (!body) return "";

    let processed = escapeHtml(body);

    const emojiMap: Record<string, string> = {
      ":tada:": "🎉",
      ":sparkles:": "✨",
      ":bug:": "🐛",
      ":memo:": "📝",
      ":rocket:": "🚀",
      ":white_check_mark:": "✅",
      ":construction:": "🚧",
      ":recycle:": "♻️",
      ":wrench:": "🔧",
      ":package:": "📦",
      ":arrow_up:": "⬆️",
      ":arrow_down:": "⬇️",
      ":warning:": "⚠️",
      ":fire:": "🔥",
      ":heart:": "❤️",
      ":star:": "⭐",
      ":zap:": "⚡",
      ":art:": "🎨",
      ":lipstick:": "💄",
      ":globe_with_meridians:": "🌐",
    };

    processed = processed.replace(
      /:[a-z0-9_]+:/g,
      (match) => emojiMap[match] || match,
    );

    processed = processed.replace(/`([0-9a-f]{7,40})`/g, (_match, hash) => {
      return `<a href="https://github.com/HydroRoll-Team/DropOut/commit/${hash}" target="_blank" class="text-emerald-500 hover:underline font-mono bg-emerald-500/10 px-1 rounded text-[10px] py-0.5 transition-colors border border-emerald-500/20 hover:border-emerald-500/50">${hash.substring(
        0,
        7,
      )}</a>`;
    });

    processed = processed.replace(
      /@([a-zA-Z0-9-]+)/g,
      '<a href="https://github.com/$1" target="_blank" class="text-zinc-300 hover:text-white hover:underline font-medium">@$1</a>',
    );

    return processed
      .split("\n")
      .map((line) => {
        line = line.trim();

        const formatLine = (text: string) =>
          text
            .replace(
              /\*\*(.*?)\*\*/g,
              '<strong class="text-zinc-200">$1</strong>',
            )
            .replace(
              /(?<!\*)\*([^*]+)\*(?!\*)/g,
              '<em class="text-zinc-400 italic">$1</em>',
            )
            .replace(
              /`([^`]+)`/g,
              '<code class="bg-zinc-800 px-1 py-0.5 rounded text-xs text-zinc-300 font-mono border border-white/5 break-all whitespace-normal">$1</code>',
            )
            .replace(
              /\[(.*?)\]\((.*?)\)/g,
              '<a href="$2" target="_blank" class="text-indigo-400 hover:text-indigo-300 hover:underline decoration-indigo-400/30 break-all">$1</a>',
            );

        if (line.startsWith("- ") || line.startsWith("* ")) {
          return `<li class="ml-4 list-disc marker:text-zinc-600 mb-1 pl-1 text-zinc-400">${formatLine(
            line.substring(2),
          )}</li>`;
        }

        if (line.startsWith("##")) {
          return `<h3 class="text-sm font-bold mt-6 mb-3 text-zinc-100 flex items-center gap-2 border-b border-white/5 pb-2 uppercase tracking-wide">${line.replace(
            /^#+\s+/,
            "",
          )}</h3>`;
        }

        if (line.startsWith("#")) {
          return `<h3 class="text-base font-bold mt-6 mb-3 text-white">${line.replace(
            /^#+\s+/,
            "",
          )}</h3>`;
        }

        if (line.startsWith("> ")) {
          return `<blockquote class="border-l-2 border-zinc-700 pl-4 py-1 my-2 text-zinc-500 italic bg-white/5 rounded-r-sm">${formatLine(
            line.substring(2),
          )}</blockquote>`;
        }

        if (line === "") return '<div class="h-2"></div>';

        return `<p class="mb-1.5 leading-relaxed">${formatLine(line)}</p>`;
      })
      .join("");
  };

  return (
    <div
      className="relative z-10 h-full overflow-y-auto custom-scrollbar scroll-smooth"
      style={{
        overflow: releasesStore.isLoading ? "hidden" : "auto",
      }}
    >
      {/* Hero Section (Full Height) - Interactive area */}
      <div
        role="tab"
        className="min-h-full flex flex-col justify-end p-12 pb-32 cursor-grab active:cursor-grabbing select-none"
        onMouseDown={handleSaturnMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleSaturnMouseUp}
        onMouseLeave={handleSaturnMouseLeave}
        onTouchStart={handleSaturnTouchStart}
        onTouchMove={handleSaturnTouchMove}
        onTouchEnd={handleSaturnTouchEnd}
        tabIndex={0}
      >
        {/* 3D Floating Hero Text */}
        <div
          className="transition-transform duration-200 ease-out origin-bottom-left"
          style={{
            transform: `perspective(1000px) rotateX(${mouseY * -1}deg) rotateY(${mouseX * 1}deg)`,
          }}
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="h-px w-12 bg-white/50"></div>
            <span className="text-xs font-mono font-bold tracking-[0.2em] text-white/50 uppercase">
              Launcher Active
            </span>
          </div>

          <h1 className="text-8xl font-black tracking-tighter text-white mb-6 leading-none">
            MINECRAFT
          </h1>

          <div className="flex items-center gap-4">
            <div className="bg-white/10 backdrop-blur-md border border-white/10 px-3 py-1 rounded-sm text-xs font-bold uppercase tracking-widest text-white shadow-sm">
              Java Edition
            </div>
            <div className="h-4 w-px bg-white/20"></div>
            <div className="text-sm text-zinc-400">
              Latest Release{" "}
              <span className="text-white font-medium">
                {gameStore.latestRelease?.id || "..."}
              </span>
            </div>
          </div>
        </div>

        {/* Action Area */}
        <div className="mt-8 flex gap-4">
          <div className="text-zinc-500 text-sm font-mono">
            &gt; Ready to launch session.
          </div>
        </div>

        {/* Scroll Hint */}
        {!releasesStore.isLoading && releasesStore.releases.length > 0 && (
          <div className="absolute bottom-10 left-12 animate-bounce text-zinc-600 flex flex-col items-center gap-2 w-fit opacity-50 hover:opacity-100 transition-opacity">
            <span className="text-[10px] font-mono uppercase tracking-widest">
              Scroll for Updates
            </span>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <title>Scroll for Updates</title>
              <path d="M7 13l5 5 5-5M7 6l5 5 5-5" />
            </svg>
          </div>
        )}
      </div>

      {/* Changelog / Updates Section */}
      <div className="bg-[#09090b] relative z-20 px-12 pb-24 pt-12 border-t border-white/5 min-h-[50vh]">
        <div className="max-w-4xl">
          <h2 className="text-2xl font-bold text-white mb-10 flex items-center gap-3">
            <span className="w-1.5 h-8 bg-emerald-500 rounded-sm"></span>
            LATEST UPDATES
          </h2>

          {releasesStore.isLoading ? (
            <div className="flex flex-col gap-8">
              {Array(3)
                .fill(0)
                .map((_, i) => (
                  <div
                    key={`release_skeleton_${i.toString()}`}
                    className="h-48 bg-white/5 rounded-sm animate-pulse border border-white/5"
                  ></div>
                ))}
            </div>
          ) : releasesStore.error ? (
            <div className="p-6 border border-red-500/20 bg-red-500/10 text-red-400 rounded-sm">
              Failed to load updates: {releasesStore.error}
            </div>
          ) : releasesStore.releases.length === 0 ? (
            <div className="text-zinc-500 italic">No releases found.</div>
          ) : (
            <div className="space-y-12">
              {releasesStore.releases.map((release, index) => (
                <div
                  key={`${release.name}_${index.toString()}`}
                  className="group relative pl-8 border-l border-white/10 pb-4 last:pb-0 last:border-l-0"
                >
                  {/* Timeline Dot */}
                  <div className="absolute -left-1.25 top-1.5 w-2.5 h-2.5 rounded-full bg-zinc-800 border border-zinc-600 group-hover:bg-emerald-500 group-hover:border-emerald-400 transition-colors"></div>

                  <div className="flex items-baseline gap-4 mb-3">
                    <h3 className="text-xl font-bold text-white group-hover:text-emerald-400 transition-colors">
                      {release.name || release.tagName}
                    </h3>
                    <div className="text-xs font-mono text-zinc-500 flex items-center gap-2">
                      <Calendar size={12} />
                      {formatDate(release.publishedAt)}
                    </div>
                  </div>

                  <div className="bg-zinc-900/50 border border-white/5 hover:border-white/10 rounded-sm p-6 text-zinc-400 text-sm leading-relaxed transition-colors overflow-hidden">
                    <div
                      className="prose prose-invert prose-sm max-w-none prose-p:text-zinc-400 prose-headings:text-zinc-200 prose-ul:my-2 prose-li:my-0 break-words whitespace-normal"
                      dangerouslySetInnerHTML={{
                        __html: formatBody(release.body),
                      }}
                    />
                  </div>

                  <a
                    href={release.htmlUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 mt-3 text-[10px] font-bold uppercase tracking-wider text-zinc-600 hover:text-white transition-colors"
                  >
                    View full changelog on GitHub <ExternalLink size={10} />
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
