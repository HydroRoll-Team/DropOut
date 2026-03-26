"use client";

import mermaid from "mermaid";
import { useEffect, useRef } from "react";

mermaid.initialize({
  startOnLoad: false,
  theme: "default",
});

export function Mermaid({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      mermaid.run({
        nodes: [ref.current],
      });
    }
  }, [chart]);

  return (
    <div className="not-prose my-6">
      <div ref={ref} className="mermaid">
        {chart}
      </div>
    </div>
  );
}
