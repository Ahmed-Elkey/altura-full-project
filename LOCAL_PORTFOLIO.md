# ALTURA teammate local profile

This private package uses the guarded, relative-path setup documented in [README_FOR_TEAMMATE.md](README_FOR_TEAMMATE.md).

- Frontend: `127.0.0.1:3100`
- Backend: `127.0.0.1:4000`
- PostgreSQL: `127.0.0.1:5434/altura_friend`
- Market: EG/EGP

Run `SETUP_ALTURA.ps1` once, `START_ALTURA.ps1` to start, and `STOP_ALTURA.ps1` to stop only the processes owned by this extracted copy. The retained `scripts/local-stack.mjs` and `portfolio:*` npm commands are the original developer workflow and are not the teammate package launcher.
