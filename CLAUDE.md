# Instructions for Claude — processing course materials

This repo is a static study app. **Never create quizzes, tests or flashcards**; the user only wants study material.

## When new files appear in `materials/`
1. Read each file. Match it to an existing reading in `data/course.json` by author and title. Every syllabus reading already exists, so add new ones only for genuinely new material.
2. For each matched reading fill in:
   - `tldr`: 1–3 sentences, the core claim or holding. Remove `"draft": true` once written from the actual text.
   - `summary`: markdown, a few short paragraphs: context, argument, how it argues.
   - `arguments`: list of key moves or claims (short markdown strings).
   - `context`: why it matters *in this course*, i.e. its place in Kennedy's arc.
   - `concepts`: ids from `concepts` (add new concepts if needed: `{id, name, short}`).
   - `source`: repo path to the file, e.g. `materials/t02-lotus.pdf`.
   - optional `conceptNotes`: `{conceptId: "how this reading uses it"}`.
   - optional `short`: label for the map.
3. Add `connections` `{from, to, type, note}`. Types: builds-on, extends, critiques, responds-to, applies, contrasts, illustrates, complicates, revisits. The note should say *what* the link is in one sentence. Prefer links across topics.
4. Update `themes` (the threads) and extend `data/guide.md` with synthesis.
5. Use `[[id]]` links inside markdown fields to cross-reference readings and concepts.

## When the user sends lecture notes
Save them as `notes/YYYY-MM-DD-slug.md` (starting with `# Title`). Add `{file, title, date, topic}` to `notes/index.json`. Add `[[id]]` links to readings and concepts where the note discusses them, and feed new insights into the guide and connections.

## Checks
- Every id referenced in connections, themes, `concepts` and `[[links]]` must exist.
- Validate JSON before committing: `python3 -m json.tool data/course.json > /dev/null`.

## Key cases and key thinkers
`data/cases-thinkers.json` holds `cases` (grouped by `case_areas`) and `thinkers` (grouped by `thinker_eras`). Each case: `id, name, year, forum, area, reading, seen[], holding, kennedy, pairs[], concepts[]`. Each thinker: `id, name, era, sensibility, position, kennedy, readings[], related[], concepts[]`. When new readings or lecture notes arrive, add or update entries there (all ids must exist).
