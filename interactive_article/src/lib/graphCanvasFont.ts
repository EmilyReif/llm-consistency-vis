/**
 * Canvas `measureText` must use the same font as SVG labels so layout (links, forces) matches
 * what is drawn. Keep in sync with `single_example_wordgraph.css` (`.article-example-untangle` svg `font-family`).
 * Safari in particular maps generic `monospace` differently to canvas vs SVG, which caused overlap
 * in long-translation word graphs.
 */
export const ARTICLE_WORDGRAPH_CANVAS_FONT_STACK =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
