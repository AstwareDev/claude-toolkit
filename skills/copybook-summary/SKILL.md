---
name: copybook-summary
description: Turn textbook chapter pages into a short, copybook friendly summary doc with diagrams, examples, bold key terms and one vocabulary table. Use for exam revision notes.
---

# Copybook summary

Use when the user sends textbook pages (screenshots or PDF) and wants notes they will copy by hand into a copybook.

## Goal

A short doc that is easy to understand and quick to write out. Visuals, examples and tables must make the topic clearer, never longer to copy.

## Style rules

- Bold is the highlight marker. The user highlights bold words with a yellow highlighter, so bold only key terms and definitions. Put one line near the top saying bold means highlight it.
- No em dashes anywhere. Avoid the slash character in written text, use words like or, per, and.
- Short lines, symbols where they save writing: arrows for cause and effect, equals for definitions.
- Define abbreviations once at the top (for example Qd, MU, CS) and reuse them.
- Use the textbook's own numbers and examples. Anything worked out by hand or added by Claude (extra examples, calculations) is either marked as extra in the reply or kept in a clearly labelled worked example.
- Do not repeat the same definition in two places. Definitions live in the body, and the end vocabulary table lists each key term once. Do not add a separate key terms table at the top.

## Process

1. Read every page image before writing. Note headings, definitions, tables, figures, case studies, activities and the subject vocabulary box.
2. Create the doc first as an outline with one pending block per section, then open it for the user.
3. Fill one section per call, in reading order. Prose sections first, drawn sections after.
4. Section shapes:
   - Definitions and rules: short bullets.
   - Comparisons and lists of factors: one pipe table (factor, effect, example).
   - Graphs and flows: a drawn diagram widget, with a one line caption under it. Draw to scale, label axes and every curve or point, and keep text under the diagram minimal.
   - Calculations: a worked example with each step on its own line, checked by hand.
5. Cover the chapter's activities by turning them into worked examples or diagram practice, not by copying questions.
6. Finish with a diagram checklist (axes, labels, units, what to say) when the topic has graphs, then one Subject vocabulary table with every key term, bold terms, short meanings in your own words.
7. Leave one comment on a passage asking the user to confirm one assumption, then hand off in one short line.

## Tool notes

- The doc editor cannot highlight text. Use bold for highlighting. Table cell shading is the only colour available.
- Diagram widgets need literal text ids, literal group names and no computed text. Write each label by hand and put group names in quotes, not variables.
- Never use bold for headings or decoration, only for the terms to highlight.
- Check numbers against the textbook table before drawing. If the book contradicts itself, use the table and say so once.