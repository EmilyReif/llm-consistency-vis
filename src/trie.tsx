import * as utils from './utils';

class TrieNode {
    // Dictionary to store child nodes, where keys are words and values are TrieNode instances.
    children: { [key: string]: TrieNode } = {};
    
    // Stores the number of leaf children under this node.
    numTotalChildren: number;
    
    // Indicates whether this node represents the end of a sentence.
    isLeaf: boolean;
    
    // Reference to the parent node, or null if this is the root.
    parent: TrieNode | null;
    
    // Stores the number of times this node (word) appears in inserted sentences.
    weight: number = 0;

    constructor(parent: TrieNode | null = null) {
        this.children = {};
        this.isLeaf = false;
        this.numTotalChildren = 0;
        this.parent = parent;
    }
}

class Trie {
    // Root node of the Trie, which is an empty node.
    root: TrieNode;

    constructor() {
        this.root = new TrieNode();
    }

    // Inserts a single sentence into the Trie.
    insert(sent: string) {
        const words = utils.tokenize(sent); // Split the sentence into words.
        let node = this.root;

        for (let word of words) {
            word = utils.unformat(word)
            // Create a new TrieNode if the word is not already present.
            if (!node.children[word]) {
                node.children[word] = new TrieNode(node);
            }
            node.isLeaf = false; // Since we are inserting, the current node is not a leaf.
            node = node.children[word]; // Move to the child node.
            node.weight += 1; // Increment weight to track occurrences of this word.
        }
        // Mark the last node as a leaf if it has no children.
        if (!Object.keys(node.children).length) {
            node.isLeaf = true;
        }
    }

    // Inserts multiple sentences into the Trie and updates numTotalChildren.
    insertSents(sents: string[]) {
        for (const sent of sents) {
            this.insert(sent);
        }
        this.computeNumLeafChildren(); // Compute the number of leaf children for all nodes.
    }

    // Recursively calculates and assigns the number of leaf children for each node.
    computeNumLeafChildren(node: TrieNode = this.root): number {
        if (node.isLeaf) {
            node.numTotalChildren = 1; // A leaf node contributes 1 to the count.
            return 1;
        }

        let count = 0;
        for (const child of Object.values(node.children)) {
            count += this.computeNumLeafChildren(child); // Sum leaf counts from child nodes.
        }
        node.numTotalChildren = count;
        return count;
    }
}

export {Trie, TrieNode}
