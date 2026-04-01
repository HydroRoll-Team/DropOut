"use client";

import mermaid from "mermaid";
import { useEffect, useRef } from "react";

mermaid.initialize({
  startOnLoad: false,
  theme: "default",
  securityLevel: "strict",
});

export function Mermaid({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let current = true;
    const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`;
    mermaid
      .render(id, chart)
      .then(({ svg }) => {
        if (!current) return;
        const parser = new DOMParser();
        const doc = parser.parseFromString(svg, "image/svg+xml");
        const svgEl = doc.querySelector("svg");
        if (ref.current && svgEl) {
          ref.current.replaceChildren(svgEl);
        }
      })
      .catch(() => {
        if (current) ref.current?.replaceChildren();
      });
    return () => {
      current = false;
    };
  }, [chart]);

  return (
    <div className="not-prose my-6">
      <div ref={ref} className="mermaid" />
    </div>
  );
}
