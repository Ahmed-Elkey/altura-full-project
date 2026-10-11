# SDD ledger — plan: docs/superpowers/plans/2026-10-09-contact-support.md
User approved design2026-10-09 and requested implementation.
| Task | Consistency/interface review |
|1|Backend owns persistence/API with explicit owner/admin/guest boundaries; returns defined detail/list shape.|
|2|Consumes task1 contract; shared UI owns no backend state; draft survives API failure.|
|3|Tests contract on preserved local DB with mail capture, not real recipients.|
|1/2|Exact endpoints/data/status/version agreed in plan; separate backend/frontend ownership.|
|1/3|Root owns deployment; worker disabled only during synthetic test, restores normal config afterwards.|
Ruling: no worktree or commits — checkout has no Git metadata; do not initialize or copy private data.
Task1: in progress.

Task2: frontend implementation and mocked tests in progress.
Ruling: read acknowledgements send displayed version — prevents marking intervening unseen replies read; backend and frontend contract updated.
Task1: complete — backend full286tests/37suites, Prisma/typecheck/build verified; additive migration deployed only after checking exactly one pending migration on local5434/altura_friend.
Task1 review: guest creation replay could renew access indefinitely. Fixed with RED/GREEN tests: only initial30min replay window, retries capped original deadline; old replay returns savedticket without access. Scoped reviewer approved.
Task2 review: corrected private Referrer-Policy precedence; added per-tab memory fallback for blocked storage and externally preserved guest reply drafts during expiry/recovery. Scoped reviewer approved.
Ruling: old creation replay returns savedticket with no accessToken; frontend uses original auth identity to route guest to secure recovery, rather than treating absence of token as customer login.
Integration first attempt: admin login intentionally always routed /admin ignoring requested /admin/support; RED browser test proved behavior. Fix honors safe requested /admin paths for ADMIN, preserving default dashboard. Rebuilding final frontend before rerun.
Task3: integration/verification in progress. API worker disabled only during synthetic captured-mail tests; restore after cleanup.

Task2/3: complete. Final production18 Support/info checks passed; broader126 browser regression checks and backend286/37 passed. Real API/DB/browser verifier passed with captured mail and cleaned synthetic data. Health200/200; mail worker restored enabled; temporary3101 stopped.
Final review: pending guest reply submission key now survives reload/recovery until confirmed success. JSON signature bound32000 handles maximum escaped5000-character replies; both short and maximum tests reproduced duplicate before fix and passed afterwards. Narrow final reviewer approved, no substantive residual findings.
