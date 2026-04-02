import React, { useId } from 'react';

interface Props {
  /** Short id shown inside the SVG (e.g. presidents, compare-a). */
  label: string;
  /** Visible caption below the figure. */
  caption: string;
}

/**
 * Wireframe SVG stand for a future interactive graph (untangle / precached data).
 */
export function InteractiveGraphPlaceholder({ label, caption }: Props) {
  const gridId = useId().replace(/:/g, '');

  return (
    <figure className="article-graph-figure">
      <div className="article-graph-placeholder-frame">
        <svg
          className="article-graph-placeholder-svg"
          viewBox="0 0 400 220"
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label={`Placeholder for interactive graph: ${label}`}
        >
          <defs>
            <pattern id={gridId} width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e8e8e8" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect x="0" y="0" width="400" height="220" fill={`url(#${gridId})`} />
          <rect x="8" y="8" width="384" height="204" fill="#fafbfc" stroke="#c5c5c5" strokeWidth="2" rx="6" />
          <text x="200" y="36" textAnchor="middle" fill="#6b6b6b" fontSize="13" fontFamily="system-ui, sans-serif">
            Interactive graph (placeholder)
          </text>
          <text x="200" y="54" textAnchor="middle" fill="#999" fontSize="11" fontFamily="ui-monospace, monospace">
            {label}
          </text>
          <g stroke="#7a9e7a" strokeWidth="1.8" fill="none" strokeLinecap="round" opacity="0.9">
            <path d="M 55 145 Q 95 115 130 125 T 195 108 T 260 118 T 330 100" />
            <path d="M 55 145 L 100 165 L 160 138 L 215 152 L 270 130" />
            <path d="M 130 125 L 165 95 L 225 88" />
          </g>
          <g fill="#4a7c59">
            <circle cx="55" cy="145" r="7" />
            <circle cx="130" cy="125" r="7" />
            <circle cx="195" cy="108" r="7" />
            <circle cx="260" cy="118" r="7" />
            <circle cx="330" cy="100" r="7" />
            <circle cx="100" cy="165" r="5" opacity="0.85" />
            <circle cx="165" cy="95" r="5" opacity="0.85" />
          </g>
          <rect
            x="120"
            y="175"
            width="160"
            height="28"
            rx="4"
            fill="#eef2ee"
            stroke="#b0c4b0"
            strokeWidth="1"
            strokeDasharray="6 4"
          />
          <text x="200" y="193" textAnchor="middle" fill="#5a6b5a" fontSize="10" fontFamily="system-ui, sans-serif">
            Mount React / D3 viz here
          </text>
        </svg>
      </div>
      <figcaption className="article-graph-figcaption">{caption}</figcaption>
    </figure>
  );
}
