---
status: draft
date: 2026-09-07
owner: Destin (decision) / YouCoded Assistant (draft)
repo: youcoded
---

# Navigation lockup tracking design

## Goal

Make the top navigation's “YOUCODED ASSISTANT” wordmark more compact without changing its typography, size, color, or tagline.

## Change

In `youcoded/docs/index.html`, reduce `.nav .wm` letter spacing from `.12em` to `.08em`. The smaller “AGENTS FOR EVERYONE” tagline retains its existing `.12em` tracking.

## Validation

Build and inspect the isolated landing-page preview at a desktop viewport. Confirm the wordmark is tighter and remains readable, while its tagline is unchanged.
