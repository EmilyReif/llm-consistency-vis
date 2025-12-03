/**
 * ReachabilityChecker maintains a memoized reachability table for cycle detection in directed graphs.
 * 
 * Uses dynamic reachability with memoization for fast cycle detection:
 * - reachable[u][v] = true if v is reachable from u
 * - O(1) cycle checks after memoization
 * - O(N) updates when adding edges (maintains transitive closure)
 */
export class ReachabilityChecker {
    // Memoized reachability table: reachable[u][v] = true if v is reachable from u
    private reachable: { [key: string]: { [key: string]: boolean } } = {};

    /**
     * Initialize reachability for a node (makes it self-reachable).
     */
    private initReachability(node: string): void {
        if (!(node in this.reachable)) {
            this.reachable[node] = {};
            this.reachable[node][node] = true;
        }
    }

    /**
     * Update reachability when adding an edge from u to v.
     * Maintains transitive closure efficiently.
     */
    addEdge(u: string, v: string): void {
        this.initReachability(u);
        this.initReachability(v);

        // v is reachable from u
        this.reachable[u][v] = true;

        // Update transitive closure: if x can reach u, then x can reach v
        // and if v can reach y, then u can reach y
        for (const x in this.reachable) {
            if (this.reachable[x] && this.reachable[x][u]) {
                if (!this.reachable[x][v]) {
                    this.reachable[x][v] = true;
                }
                // Also propagate: if v can reach any node, x can reach it too
                if (this.reachable[v]) {
                    for (const y in this.reachable[v]) {
                        if (!this.reachable[x][y]) {
                            this.reachable[x][y] = true;
                        }
                    }
                }
            }
        }

        // If v can reach any node y, then u can reach y
        if (this.reachable[v]) {
            for (const y in this.reachable[v]) {
                if (!this.reachable[u][y]) {
                    this.reachable[u][y] = true;
                }
            }
        }
    }


    /**
     * Check if merging 'word' with 'existingWord' would create a cycle through an incoming edge.
     * This checks if existingWord can reach prevWord, which would create:
     * existingWord -> ... -> prevWord -> existingWord (after merging)
     */
    wouldCreateCycleThroughIncomingEdge(existingWord: string, prevWord: string): boolean {
        this.initReachability(existingWord);
        this.initReachability(prevWord);
        return !!(this.reachable[existingWord] && this.reachable[existingWord][prevWord]);
    }

    /**
     * Initialize a node in the reachability table (public method for external use).
     */
    initNode(node: string): void {
        this.initReachability(node);
    }
}

