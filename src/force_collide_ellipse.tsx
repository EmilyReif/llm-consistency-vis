/**
 * Ellipse Force Collide
 * A custom d3 force for simulating collisions between ellipse-shaped nodes (ie, text blobs).
 * Adapted from https://gist.github.com/jpurma/6dd2081cf25a5d2dfcdcab1a4868f237
 */

export interface EllipseNode {
    x: number;
    y: number;
    vx: number;
    vy: number;
    rx: number;
    ry: number;
  }
  
  type PaddingFunction = (node: EllipseNode, index: number, nodes: EllipseNode[]) => number;
  
  function constant(x: number): PaddingFunction {
    return function () {
      return x;
    };
  }
  
  export function ellipseForce(
    nodes: EllipseNode[],
    padding: any = 4,
    innerRepulsion: number = 0.5,
    outerRepulsion: number = 0.5
  ) {
  
    if (typeof padding !== "function") {
      padding = constant(+padding);
    }
  
    function force(alpha: number): void {
      const n = nodes.length;
      const myOuterRepulsion = outerRepulsion * 16;
  
      for (let i = 0; i < n; ++i) {
        const node = nodes[i];
        const my_padding = +padding(node, i, nodes);
        const my_w = node.rx + my_padding;
        const my_h = node.ry + my_padding;
        const my_w2 = my_w * my_w;
        const my_h2 = my_h * my_h;
        const my_wh = my_w * my_h;
        const my_x = node.x + node.vx;
        const my_y = node.y + node.vy;
  
        for (let j = 0; j < n; ++j) {
          if (j === i) continue;
  
          const other = nodes[j];
          const other_padding = +padding(other, j, nodes);
          const other_w = other.rx + other_padding;
          const other_h = other.ry + other_padding;
          const other_x = other.x + other.vx;
          const other_y = other.y + other.vy;
  
          let dist_x = my_x - other_x;
          let dist_y = my_y - other_y;
  
          if (dist_x === 0 && dist_y === 0) {
            node.vx += Math.random() * 4 - 2;
            node.vy += Math.random() * 4 - 2;
            continue;
          }
  
          let force_ratio: number;
          let dist: number;
          let gap: number;
          let x_component: number;
          let y_component: number;
  
          if (dist_x === 0) {
            force_ratio = (my_h / my_w + other_h / other_w) / 2;
            dist = Math.abs(dist_y);
            gap = dist - my_h - other_h;
          } else if (dist_y === 0) {
            force_ratio = 1;
            dist = Math.abs(dist_x);
            gap = dist - my_w - other_w;
          } else {
            const g = dist_y / dist_x;
            const g2 = g * g;
  
            const x1 = my_wh / Math.sqrt(my_h2 + g2 * my_w2);
            const y1 = g * x1;
            const d1 = Math.sqrt(x1 * x1 + y1 * y1);
            const force_ratio1 = d1 / my_w;
  
            const x2 = (other_w * other_h) / Math.sqrt(other_h * other_h + g2 * other_w * other_w);
            const y2 = g * x2;
            const d2 = Math.sqrt(x2 * x2 + y2 * y2);
            const force_ratio2 = d2 / other_w;
  
            dist = Math.sqrt(dist_x * dist_x + dist_y * dist_y);
            gap = dist - d2 - d1;
            force_ratio = (force_ratio1 + force_ratio2) / 2;
          }
  
          x_component = dist_x / dist;
          y_component = dist_y / dist;
  
          let repulsion: number;
  
          if (gap < 0) {
            repulsion = Math.min(Math.max(1.0, innerRepulsion * force_ratio * -gap), 5.0);
          } else {
            repulsion = Math.min(20.0, (force_ratio * myOuterRepulsion * alpha) / gap);
          }
  
          node.vx += repulsion * x_component;
          node.vy += repulsion * y_component;
        }
      }
    }
  
    force.initialize = function (_nodes: EllipseNode[]): void {
      nodes = _nodes;
    };
  
    force.outerRepulsion = function (_outerRepulsion?: number): number | typeof force {
      if (_outerRepulsion === undefined) return outerRepulsion;
      outerRepulsion = +_outerRepulsion;
      return force;
    };
  
    force.innerRepulsion = function (_innerRepulsion?: number): number | typeof force {
      if (_innerRepulsion === undefined) return innerRepulsion;
      innerRepulsion = +_innerRepulsion;
      return force;
    };
  
    force.padding = function (_padding?: number | PaddingFunction): PaddingFunction | typeof force {
      if (_padding === undefined){
        return padding as any;
      } 
      padding = typeof _padding === "function" ? _padding : constant(+_padding);
      return force;
    };
  
    return force;
  }
  