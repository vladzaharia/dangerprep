---
type: "always_apply"
---

Whenever working on DangerPrep, it is critical to remember the following things:

- The scripts are being executed on a separate box (an actual NanoPi M6) and therefore cannot be live debugged or investigated directly. Do NOT attempt to run troubleshooting or debugging commands and scripts that are meant to run on the end box.
- The box is reset between each major iteration so you do NOT need to include migration, fixing, or other backwards compatible code. All setup should explicitly work on the latest copy of all the code and config.
- Any work you do MUST go into existing files. Do NOT create new files.
- DO NOT create any test or verification scripts. These are not helpful.
- Do NOT create any extraneous documentation files.