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

      // Pre-calculate node properties once per iteration
      interface NodeProps {
        w: number;
        h: number;
        w2: number;
        h2: number;
        wh: number;
        x: number;
        y: number;
        maxRadius: number; // For early exit checks
      }
      const nodeProps: NodeProps[] = new Array(n);
      
      for (let i = 0; i < n; ++i) {
        const node = nodes[i];
        const node_padding = +padding(node, i, nodes);
        const w = node.rx + node_padding;
        const h = node.ry + node_padding;
        nodeProps[i] = {
          w,
          h,
          w2: w * w,
          h2: h * h,
          wh: w * h,
          x: node.x + node.vx,
          y: node.y + node.vy,
          maxRadius: Math.max(w, h)
        };
      }

      // Check each pair only once (j > i) and apply forces symmetrically
      for (let i = 0; i < n; ++i) {
        const node = nodes[i];
        const props_i = nodeProps[i];

        for (let j = i + 1; j < n; ++j) {
          const other = nodes[j];
          const props_j = nodeProps[j];

          let dist_x = props_i.x - props_j.x;
          let dist_y = props_i.y - props_j.y;

          // Early exit: if nodes are very far apart, skip expensive calculations
          // Using squared distance to avoid sqrt
          const distSquared = dist_x * dist_x + dist_y * dist_y;
          const maxDistSquared = (props_i.maxRadius + props_j.maxRadius + 100) ** 2;
          if (distSquared > maxDistSquared) continue;

          if (dist_x === 0 && dist_y === 0) {
            const randomX = Math.random() * 4 - 2;
            const randomY = Math.random() * 4 - 2;
            node.vx += randomX;
            node.vy += randomY;
            other.vx -= randomX;
            other.vy -= randomY;
            continue;
          }

          let force_ratio: number;
          let dist: number;
          let gap: number;
          let x_component: number;
          let y_component: number;

          if (dist_x === 0) {
            force_ratio = (props_i.h / props_i.w + props_j.h / props_j.w) / 2;
            dist = Math.abs(dist_y);
            gap = dist - props_i.h - props_j.h;
          } else if (dist_y === 0) {
            force_ratio = 1;
            dist = Math.abs(dist_x);
            gap = dist - props_i.w - props_j.w;
          } else {
            const g = dist_y / dist_x;
            const g2 = g * g;

            const x1 = props_i.wh / Math.sqrt(props_i.h2 + g2 * props_i.w2);
            const y1 = g * x1;
            const d1 = Math.sqrt(x1 * x1 + y1 * y1);
            const force_ratio1 = d1 / props_i.w;

            const x2 = props_j.wh / Math.sqrt(props_j.h2 + g2 * props_j.w2);
            const y2 = g * x2;
            const d2 = Math.sqrt(x2 * x2 + y2 * y2);
            const force_ratio2 = d2 / props_j.w;

            dist = Math.sqrt(distSquared);
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

          // Apply forces symmetrically (Newton's third law)
          node.vx += repulsion * x_component;
          node.vy += repulsion * y_component;
          other.vx -= repulsion * x_component;
          other.vy -= repulsion * y_component;
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
  