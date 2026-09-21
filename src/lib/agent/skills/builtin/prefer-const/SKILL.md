---
name: prefer-const
description: Use when the user asks to refactor JavaScript or TypeScript bindings.
triggers: [refactor, javascript, typescript]
allowedTools: [read_file, apply_patch]
version: "1.0"
enabled: true
---
Prefer const over let unless reassignment is required.
