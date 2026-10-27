# Law in Global Affairs — study terminal

A retro-terminal study companion for Prof. David Kennedy's *Law in Global Affairs* (HLS, Fall 2026).
It is a static site: open it on GitHub Pages on a Mac or phone. On iPhone use Share → Add to Home Screen.

## what's inside

| path | what |
|---|---|
| `data/course.json` | parts, topics, readings (summaries, arguments), concepts, connections, threads, deliverables |
| `data/guide.md` | the semester study guide (synthesis) |
| `data/progress.json` | reading status + current topic (written by the app when sync is on) |
| `notes/` | lecture notes in markdown + `index.json` |
| `materials/` | raw course files (PDFs etc.), dropped in for processing |

## workflow

1. Upload readings into `materials/`, and lecture notes into `notes/` (or send them to Claude).
2. Claude processes them and updates `data/course.json` and `data/guide.md`.
3. The app picks the changes up automatically, about a minute after a push.

## sync between devices

Without a token, reading status and notes written in the app stay on that device.
In **[s]et**, paste a fine-grained GitHub token (this repo only, *Contents: read & write*). Progress and new notes are then committed to the repo and show up on every device.

## run locally

```
python3 -m http.server 8000
```
