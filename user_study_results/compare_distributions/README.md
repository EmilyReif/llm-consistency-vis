# Compare Distributions User Study

## Config

- **Places** (`user_study_places_temp`): prompt indices 0,2 at temp 0.3
- **Monsters** (`user_study_monsters_temp`): prompt indices 0,2 at temp 0.2 (human child vs folklore)
- **Generations**: 20 per prompt

## Questions (embedded in HTML)

1. **Diversity** (TTR): unique words / total words across all 20 generations concatenated
2. **Name most frequent**: "Which creature/place name appeared most frequently?" (options from actual outputs)
3. **Name percentage**: Slider 1–100% — "In Prompt A's outputs, what % contained [name]?"
4. **Theme**: "Which theme best describes the majority?" (e.g., sacred forest, cursed light-drainers)
5. **Phrase most frequent**: "Which phrase appeared most frequently?" (from later in outputs)
6. **Impossible**: "Which is most likely impossible under this prompt (even with 1000 generations)?"
7. **Sentence likelihood**: "Is this output from A or B?" (subtle sentence from one prompt)
8. **Same distribution?**: "Do A and B sample from the same or different distributions?"
9. **Overlap (semantic)**: "Which theme/structure is shared by BOTH sets (beyond specific names)?"
10. **Unique to A / Unique to B**: "Which output could [A/B] have generated but [B/A] likely would not?"
11. **Preference**: production use, confidence (inter-rater agreement)
