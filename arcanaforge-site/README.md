# ArcanaForge — Campaign Command Center (PWA)

Your GM toolkit, packaged as an installable Progressive Web App. Everything lives
in one folder and runs from one origin, so all tools share the same Codex data
automatically — no more importing per tool, no more `file://` storage split.

This is the successor to the original ArcanaForge (Flask) build — same name, logo
and generator library, rebuilt as a single static, installable PWA so it can run
anywhere without a Python server or backend.

## What's in this folder

| File | What it is |
|------|------------|
| `index.html` | Site entry — opens the dashboard |
| `dashboard.html` | ArcanaForge — main command center |
| `codex.html` | The Codex — your data hub (single source of truth) |
| `character-sheets.html`, `initiative-tracker.html` | Player + combat tools |
| `npc-generator.html`, `loot-generator.html`, `shop-generator.html`, `dungeon-generator.html`, `environment-generator.html` | Codex-driven generators |
| `campaign-notes.html`, `group-inventory.html` | Campaign tracking tools |
| `manifest.webmanifest` | Makes it installable (name, icons, shortcuts) |
| `sw.js` | Service worker — offline support + fast loads |
| `icon-*.png`, `favicon.png` | App icons |
| `arcanaforge-mark.png`, `arcanaforge-wordmark.png` | Brand logo — AF monogram + full wordmark |

**Keep every file in the same folder.** All links are relative, so it works at a
domain root or in a subfolder — but the files must stay together.

## Important: a PWA can't run from `file://`

Service workers require a real origin (`http://localhost` or `https://`). Opening
the files directly from your Downloads folder won't enable install or offline.
Use one of the two options below.

## Option 1 — Test locally (Windows)

1. Put all these files in one folder.
2. Open that folder in File Explorer, click the address bar, type `cmd`, press Enter.
3. Run:  `py -m http.server 8000`   (or `python -m http.server 8000`)
4. Open **http://localhost:8000/** in Chrome or Edge.
5. To install: click the install icon in the address bar (or menu → "Install ArcanaForge").

Leave the terminal open while you use it; closing it stops the server.

## Option 2 — Host it (permanent + shareable)

Push the folder to a **GitHub Pages** repo (Settings → Pages → deploy from branch).
Your site will be at `https://<you>.github.io/<repo>/`. Because it's HTTPS, it
installs and works offline on desktop and mobile, reachable from any device.

## Moving your existing data over

A new origin (`localhost` or `github.io`) starts with empty storage, separate from
your old `file://` data. To bring your library across, once:

1. Open your current `file://` Codex → **Export** the JSON.
2. Open the Codex on the new origin → **Import** that JSON.

After that it's one consistent store. Every tool reads the live Codex automatically.

## Updating later

When you change a tool, just replace its file and reload — pages are fetched
**network-first**, so online you always get the newest version. If you ever want to
force a full cache refresh, bump `CACHE_VERSION` near the top of `sw.js`.
