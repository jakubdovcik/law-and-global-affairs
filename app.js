'use strict';
/* LGA study terminal — static app. Data lives in data/*.json, data/guide.md and notes/.
   Optional GitHub token (settings) lets notes + progress save back into the repo so they sync across devices. */

const STATUSES = [['todo', ' '], ['reading', '~'], ['read', 'x'], ['reviewed', '*']];
const RELATIONS = {
  'builds-on': 'builds on', 'extends': 'extends', 'critiques': 'critiques', 'responds-to': 'responds to',
  'applies': 'applies', 'contrasts': 'contrasts with', 'illustrates': 'illustrates', 'complicates': 'complicates', 'revisits': 'revisits',
};

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } },
};
const today = () => new Date().toISOString().slice(0, 10);
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'note';

function detectRepo() {
  const h = location.hostname;
  if (h.endsWith('.github.io')) return h.split('.')[0] + '/' + (location.pathname.split('/')[1] || h);
  return 'jakubdovcik/law-and-global-affairs';
}

const S = {
  course: null, guide: '', notes: [], progress: {}, R: {}, C: {},
  settings: Object.assign({ token: '', repo: detectRepo(), branch: 'main', theme: 'green' }, LS.get('lga.settings', {})),
};

/* ---------- github ---------- */
const b64e = s => { const b = new TextEncoder().encode(s); let o = ''; for (let i = 0; i < b.length; i++) o += String.fromCharCode(b[i]); return btoa(o); };
const b64d = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g, '')), c => c.charCodeAt(0)));
const online = () => !!S.settings.token;

async function ghGet(path) {
  const { token, repo, branch } = S.settings;
  const r = await fetch(`https://api.github.com/repos/${repo}/contents/${path}?ref=${branch}&t=${Date.now()}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`github ${r.status}`);
  return r.json();
}
let ghQueue = Promise.resolve();
function ghPut(path, text, message) {
  const job = async () => {
    const { token, repo, branch } = S.settings;
    const cur = await ghGet(path);
    const r = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      body: JSON.stringify({ message, content: b64e(text), branch, ...(cur ? { sha: cur.sha } : {}) }),
    });
    if (!r.ok) throw new Error(`github ${r.status}: ${(await r.json().catch(() => ({}))).message || ''}`);
  };
  ghQueue = ghQueue.then(job, job);
  return ghQueue;
}

async function readText(path) {
  if (online()) {
    try { const f = await ghGet(path); if (f) return b64d(f.content); } catch (e) { syncMsg('github read failed — using site copy'); }
  }
  const r = await fetch(path, { cache: 'no-store' });
  if (!r.ok) throw new Error(path + ' ' + r.status);
  return r.text();
}
const readJSON = async p => JSON.parse(await readText(p));

/* ---------- load ---------- */
async function load() {
  const [course, guide, nidx, prog] = await Promise.all([
    readJSON('data/course.json'),
    readText('data/guide.md').catch(() => ''),
    readJSON('notes/index.json').catch(() => []),
    readJSON('data/progress.json').catch(() => ({})),
  ]);
  course.readings ||= []; course.concepts ||= []; course.connections ||= []; course.themes ||= []; course.topics ||= []; course.parts ||= []; course.deliverables ||= [];
  S.course = course; S.guide = guide;
  S.R = Object.fromEntries(course.readings.map(r => [r.id, r]));
  S.C = Object.fromEntries(course.concepts.map(c => [c.id, c]));

  const bodies = await Promise.all(nidx.map(n => readText('notes/' + n.file).catch(() => '')));
  S.notes = nidx.map((n, i) => ({ ...n, id: n.file, body: bodies[i], src: 'repo' }));
  S.notes.push(...LS.get('lga.notes', []).map(n => ({ ...n, src: 'local' })));

  // progress: merge repo + local, newest timestamp wins
  const local = LS.get('lga.progress', {});
  S.progress = { ...prog };
  for (const [k, v] of Object.entries(local)) if (!S.progress[k] || (v.t || 0) > (S.progress[k].t || 0)) S.progress[k] = v;
}

/* ---------- helpers ---------- */
const topicOf = n => S.course.topics.find(t => t.n === +n);
const partOf = n => S.course.parts.find(p => p.topics.includes(+n));
const currentTopic = () => S.progress.__current?.n || 1;
const tShort = t => t.title.length > 60 ? t.title.slice(0, 58) + '…' : t.title;
const status = id => S.progress[id]?.s || 'todo';
const stChar = id => STATUSES.find(s => s[0] === status(id))[1];
function bar(frac, w = 24) { const n = Math.round(Math.max(0, Math.min(1, frac)) * w); return '█'.repeat(n) + '░'.repeat(w - n); }
const rLabel = r => `${r.author ? esc(r.author) + ' — ' : ''}${esc(r.title)}`;
const rShort = r => r.short || (r.title.length > 34 ? r.title.slice(0, 33) + '…' : r.title);
const readingsIn = n => S.course.readings.filter(r => r.topic === +n);
const ent = id => S.R[id] ? { kind: 'r', name: S.R[id].title, o: S.R[id] } : S.C[id] ? { kind: 'c', name: S.C[id].name, o: S.C[id] } : null;
const entLink = id => { const e = ent(id); return e ? `<a href="#/${e.kind}/${esc(id)}">${e.kind === 'r' ? rLabel(e.o) : esc(e.name)}</a>` : `<span class="dim">${esc(id)}?</span>`; };

function wiki(s) {
  return String(s || '').replace(/\[\[([a-z0-9][a-z0-9\-]*)(?:\|([^\]]+))?\]\]/gi, (m, id, label) => {
    const e = ent(id); return e ? `[${label || e.name}](#/${e.kind}/${id})` : (label || id);
  });
}
const md = s => (window.marked ? marked.parse(wiki(s)) : `<pre>${esc(wiki(s))}</pre>`);
const noteRefs = n => [...new Set([...(n.links || []), ...[...String(n.body || '').matchAll(/\[\[([a-z0-9][a-z0-9\-]*)/gi)].map(m => m[1])])];
const notesAbout = id => S.notes.filter(n => noteRefs(n).includes(id));

function stBtn(id) { const s = status(id); return `<button class="st s-${s}" data-status="${esc(id)}" title="${s} — click to cycle">[${stChar(id)}]</button>`; }
function readingRow(r, showTopic = true) {
  return `<div class="row">${stBtn(r.id)}<span class="grow"><a href="#/r/${esc(r.id)}">${rLabel(r)}</a>${r.year ? ` <span class="dim">${r.year}</span>` : ''}</span>${showTopic ? `<span class="r dim">t${r.topic}</span>` : ''}</div>`;
}
function readingsBySub(t) {
  const rs = readingsIn(t.n), subs = [...new Set([...(t.subs || []), ...rs.map(r => r.sub || '')])];
  return subs.map(s => [s, rs.filter(r => (r.sub || '') === s)]).filter(([, l]) => l.length);
}
function edgeHTML(c, perspective) {
  const other = perspective === c.from ? c.to : c.from;
  const rel = RELATIONS[c.type] || c.type;
  const arrow = perspective === c.from ? `<span class="rel">──${esc(rel)}──▶</span> ${entLink(other)}` : `${entLink(other)} <span class="rel">──${esc(rel)}──▶</span> <span class="dim">this</span>`;
  return `<div class="edge">${arrow}${c.note ? `<div class="note">${md(c.note).replace(/^<p>|<\/p>\s*$/g, '')}</div>` : ''}</div>`;
}
const empty = s => `<div class="empty">${s}</div>`;

function setStatus(id, s, extra) {
  S.progress[id] = { ...S.progress[id], ...(s ? { s } : {}), ...extra, t: Date.now() };
  LS.set('lga.progress', S.progress);
  if (online()) { clearTimeout(setStatus.t); setStatus.t = setTimeout(pushProgress, 1500); }
}
async function pushProgress() {
  syncMsg('syncing progress…');
  try { await ghPut('data/progress.json', JSON.stringify(S.progress, null, 1), 'progress update'); syncMsg('progress synced ✓'); }
  catch (e) { syncMsg('sync failed: ' + e.message); }
}
function syncMsg(s) { $('#sync').textContent = s; }
function toast(s) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = s; document.body.append(t); setTimeout(() => t.remove(), 1800); }

/* ---------- views ---------- */
function vDash(v) {
  const c = S.course, ct = currentTopic(), T = c.topics.length || 1;
  const rs = c.readings, done = rs.filter(r => ['read', 'reviewed'].includes(status(r.id))).length, rev = rs.filter(r => status(r.id) === 'reviewed').length;
  const tp = topicOf(ct), nx = topicOf(ct + 1), pt = partOf(ct);
  const recent = [...S.notes].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5);
  v.innerHTML = `
  <pre class="dim" style="margin:0 0 6px;white-space:pre-wrap">┌─ ${esc(c.title)} ─ ${esc(c.school)} ─ ${esc(c.term)} ─ prof. ${esc(c.professor || '')}</pre>
  <div class="box">
    <div>course   <span class="bar">${bar(ct / T)}</span> topic ${ct}/${T}</div>
    <div>readings <span class="bar">${bar(rs.length ? done / rs.length : 0)}</span> ${done}/${rs.length} read · ${rev} reviewed</div>
    <div class="dim">${S.notes.length} lecture notes · ${c.concepts.length} concepts · ${c.connections.length} connections</div>
  </div>
  ${tp ? `<h2>now · topic ${ct}${pt ? ` <span class="dim">(part ${esc(pt.id)})</span>` : ''}</h2>
  <p><a href="#/topic/${ct}">${esc(tp.title)}</a></p>
  ${readingsIn(ct).map(r => readingRow(r, false)).join('') || empty('no readings')}` : ''}
  ${nx ? `<h2>up next · topic ${nx.n}</h2><p><a href="#/topic/${nx.n}">${esc(nx.title)}</a> <span class="dim">— ${readingsIn(nx.n).length} readings</span></p>` : ''}
  <h2>deliverables</h2>${c.deliverables.map(delivRow).join('')}
  <h2>threads</h2>
  ${c.themes.map(t => `<div class="row"><span class="dim">»</span><span class="grow"><a href="#/guide">${esc(t.name)}</a> <span class="dim">— ${t.readings?.length || 0} readings</span></span></div>`).join('') || empty('threads appear once readings are processed')}
  <h2>recent lecture notes</h2>
  ${recent.map(noteRow).join('') || empty(`no notes yet — <a href="#/new">write one</a>`)}`;
}

function delivRow(d) {
  const p = S.progress['d:' + d.id] || {}, s = p.s || 'todo';
  const ch = { todo: ' ', reading: '~', read: 'x', reviewed: 'x' }[s];
  return `<div class="row"><button class="st s-${s}" data-deliv="${esc(d.id)}" title="todo → drafting → submitted">[${ch}]</button>
    <span class="grow">${esc(d.name)} <span class="dim">${s === 'reading' ? '· drafting' : s !== 'todo' ? '· submitted' : ''}</span>
    ${d.id.startsWith('paper') ? `<select class="f" data-deltopic="${esc(d.id)}" style="width:auto;display:inline-block;font-size:13px;padding:0 4px;margin-left:4px">
      <option value="">on topic…</option>${S.course.topics.map(t => `<option value="${t.n}" ${+p.topic === t.n ? 'selected' : ''}>t${t.n} · ${esc(t.title.slice(0, 40))}</option>`).join('')}</select>` : ''}
    <div class="meta">${esc(d.due)}${d.note ? ' · ' + esc(d.note) : ''}</div></span></div>`;
}

function vTopics(v) {
  const ct = currentTopic();
  v.innerHTML = `<h1>topics</h1><div class="meta">▶ = where you are now (set it on a topic page)</div>` + S.course.parts.map(p => `
    <h2>${esc(p.id)}. ${esc(p.title)}</h2>
    ${p.topics.map(topicOf).filter(Boolean).map(t => {
      const rs = readingsIn(t.n), d = rs.filter(r => ['read', 'reviewed'].includes(status(r.id))).length;
      return `<div class="row"><span class="${t.n === ct ? 'acc' : 'dim'}">${t.n === ct ? '▶' : ' '}${String(t.n).padStart(2, '0')}</span>
        <span class="grow"><a href="#/topic/${t.n}">${esc(t.title)}</a></span>
        <span class="r dim">${d}/${rs.length}</span></div>`;
    }).join('')}`).join('');
}

function vTopic(v, n) {
  const t = topicOf(n); if (!t) return vNotFound(v);
  const rs = readingsIn(n), ns = S.notes.filter(x => +x.topic === +n), pt = partOf(n);
  const cids = [...new Set(rs.flatMap(r => r.concepts || []))];
  const ids = new Set(rs.map(r => r.id));
  const conns = S.course.connections.filter(c => ids.has(c.from) || ids.has(c.to));
  const ext = conns.filter(c => !(ids.has(c.from) && ids.has(c.to)));
  const isCur = currentTopic() === +n;
  v.innerHTML = `<div class="meta">${pt ? `part ${esc(pt.id)} · ${esc(pt.title)}` : ''}</div>
  <h1>topic ${t.n} · ${esc(t.title)}</h1>
  <div class="meta">${topicOf(+n - 1) ? `<a href="#/topic/${+n - 1}">‹ prev</a>` : ''} ${topicOf(+n + 1) ? `<a href="#/topic/${+n + 1}">next ›</a>` : ''}
    · ${isCur ? '<span class="acc">▶ current topic</span>' : `<button class="btn" data-current="${t.n}" style="font-size:12px;padding:0 6px">set as current</button>`}</div>
  ${t.overview ? `<div class="box">${md(t.overview)}</div>` : ''}
  ${readingsBySub(t).map(([s, l]) => `${s ? `<h3>${esc(s)}</h3>` : '<h2>readings</h2>'}${l.map(r => readingRow(r, false) + (r.tldr ? `<div class="meta" style="padding-left:4ch">${esc(r.tldr)}</div>` : '')).join('')}`).join('') || empty('none')}
  ${cids.length ? `<h2>concepts</h2>${cids.map(id => `<a class="tag" href="#/c/${esc(id)}">${esc(S.C[id]?.name || id)}</a>`).join('')}` : ''}
  ${conns.length ? `<h2>connections</h2>${conns.map(c => `<div class="edge">${entLink(c.from)} <span class="rel">──${esc(RELATIONS[c.type] || c.type)}──▶</span> ${entLink(c.to)}</div>`).join('')}` : ''}
  ${ext.length ? `<div class="meta">${ext.length} of these reach outside this topic</div>` : ''}
  <h2>lecture notes</h2>${ns.map(noteRow).join('') || empty(`none — <a href="#/new?topic=${t.n}">add one</a>`)}`;
}

function vReadings(v) {
  v.innerHTML = `<h1>readings</h1><div class="meta">[ ] todo · [~] reading · [x] read · [*] reviewed — click to cycle</div>` +
    (S.course.topics.filter(t => readingsIn(t.n).length).map(t => `<h2>t${t.n} · ${esc(tShort(t))}</h2>${readingsBySub(t).map(([s, l]) => `${s ? `<div class="dim" style="margin-top:6px">— ${esc(s)}</div>` : ''}${l.map(r => readingRow(r, false)).join('')}`).join('')}`).join('') || empty('no readings yet'));
}

function vReading(v, id) {
  const r = S.R[id]; if (!r) return vNotFound(v);
  const conns = S.course.connections.filter(c => c.from === id || c.to === id)
    .sort((a, b) => (S.R[a.from === id ? a.to : a.from]?.topic || 99) - (S.R[b.from === id ? b.to : b.from]?.topic || 99));
  const shared = S.course.readings.filter(o => o.id !== id && (o.concepts || []).some(c => (r.concepts || []).includes(c)));
  const ns = notesAbout(id);
  const src = r.source ? `https://github.com/${S.settings.repo}/blob/${S.settings.branch}/${r.source.split('/').map(encodeURIComponent).join('/')}` : '';
  v.innerHTML = `<h1>${esc(r.title)}</h1>
  <div class="meta">${esc(r.author || '')}${r.year ? ' · ' + r.year : ''} · <a href="#/topic/${r.topic}">topic ${r.topic}</a>${r.sub ? ' · ' + esc(r.sub) : ''}${r.cite ? '<br>' + esc(r.cite) : ''}${src ? ` · <a href="${esc(src)}" target="_blank" rel="noopener">source ↗</a>` : ''}</div>
  <div class="btns">${STATUSES.map(([s, ch]) => `<button class="btn ${status(id) === s ? 'on' : ''}" data-set="${esc(id)}" data-s="${s}">[${ch}] ${s}</button>`).join('')}</div>
  ${r.tldr ? `<p class="tldr">${md(r.tldr).replace(/^<p>|<\/p>\s*$/g, '')}</p>` : ''}
  ${r.draft && !r.summary ? '<div class="meta">// quick sketch from general knowledge. full summary comes once the excerpt is uploaded</div>' : ''}
  ${r.summary ? `<h2>summary</h2>${md(r.summary)}` : ''}
  ${r.arguments?.length ? `<h2>key arguments</h2><ol>${r.arguments.map(a => `<li>${md(a).replace(/^<p>|<\/p>\s*$/g, '')}</li>`).join('')}</ol>` : ''}
  ${r.context ? `<h2>why it matters in the course</h2>${md(r.context)}` : ''}
  ${r.concepts?.length ? `<h2>concepts</h2>${r.concepts.map(c => `<a class="tag" href="#/c/${esc(c)}">${esc(S.C[c]?.name || c)}</a>`).join('')}` : ''}
  <h2>connections</h2>${conns.map(c => edgeHTML(c, id)).join('') || empty('no explicit connections yet')}
  ${shared.length ? `<h2>shares concepts with</h2>${shared.map(o => readingRow(o)).join('')}` : ''}
  <h2>lecture notes</h2>${ns.map(noteRow).join('') || empty(`none link here — use <code>[[${esc(id)}]]</code> in a note`)}`;
}

function vConcepts(v) {
  const cs = [...S.course.concepts].sort((a, b) => a.name.localeCompare(b.name));
  const count = id => S.course.readings.filter(r => (r.concepts || []).includes(id)).length;
  v.innerHTML = `<h1>concepts</h1>` + (cs.map(c => `<div class="row"><span class="grow"><a href="#/c/${esc(c.id)}">${esc(c.name)}</a>${c.short ? ` <span class="dim">— ${esc(c.short)}</span>` : ''}</span><span class="r dim">${count(c.id)}r</span></div>`).join('') || empty('concepts appear as readings are processed'));
}

function vConcept(v, id) {
  const c = S.C[id]; if (!c) return vNotFound(v);
  const rs = S.course.readings.filter(r => (r.concepts || []).includes(id)).sort((a, b) => a.topic - b.topic);
  const conns = S.course.connections.filter(x => x.from === id || x.to === id);
  const co = {}; rs.forEach(r => (r.concepts || []).forEach(k => k !== id && (co[k] = (co[k] || 0) + 1)));
  const related = Object.entries(co).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  v.innerHTML = `<h1>${esc(c.name)}</h1>
  ${c.short ? `<p class="tldr">${esc(c.short)}</p>` : ''}
  ${c.definition ? md(c.definition) : ''}
  <h2>trajectory through the course</h2>
  ${rs.map(r => `${readingRow(r)}${r.conceptNotes?.[id] ? `<div class="meta" style="padding-left:4ch">${esc(r.conceptNotes[id])}</div>` : ''}`).join('') || empty('no readings yet')}
  ${conns.length ? `<h2>connections</h2>${conns.map(x => edgeHTML(x, id)).join('')}` : ''}
  ${related.length ? `<h2>travels with</h2>${related.map(k => `<a class="tag" href="#/c/${esc(k)}">${esc(S.C[k]?.name || k)}</a>`).join('')}` : ''}
  <h2>lecture notes</h2>${notesAbout(id).map(noteRow).join('') || empty('none')}`;
}

function vGuide(v) {
  const th = S.course.themes;
  v.innerHTML = `<h1>study guide</h1>
  ${th.length ? `<h2>threads across the semester</h2>${th.map(t => {
    const rs = (t.readings || []).map(id => S.R[id]).filter(Boolean).sort((a, b) => a.topic - b.topic);
    return `<div class="box"><b class="hi">${esc(t.name)}</b>${t.description ? md(t.description) : ''}
      ${rs.map((r, i) => {
        const prev = rs[i - 1];
        const link = prev && S.course.connections.find(c => (c.from === r.id && c.to === prev.id) || (c.from === prev.id && c.to === r.id));
        return `${i ? `<div class="dim" style="padding-left:2ch">│${link ? ` <span class="rel">${esc(RELATIONS[link.type] || link.type)}</span>` : ''}</div>` : ''}<div class="row"><span class="dim">t${String(r.topic).padStart(2, '0')}</span><span class="grow"><a href="#/r/${esc(r.id)}">${rLabel(r)}</a></span></div>`;
      }).join('')}
      ${(t.concepts || []).length ? `<div style="margin-top:6px">${t.concepts.map(k => `<a class="tag" href="#/c/${esc(k)}">${esc(S.C[k]?.name || k)}</a>`).join('')}</div>` : ''}</div>`;
  }).join('')}` : ''}
  ${S.guide ? md(S.guide) : empty('the study guide is written as materials come in')}`;
}

function noteRow(n) {
  return `<div class="row"><span class="dim">${esc(n.date || '')}</span><span class="grow"><a href="#/n/${encodeURIComponent(n.id)}">${esc(n.title)}</a></span><span class="r dim">${n.topic ? 't' + n.topic : ''}${n.src === 'local' ? ' · local' : ''}</span></div>`;
}
function vNotes(v) {
  const ns = [...S.notes].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  v.innerHTML = `<h1>lecture notes</h1>
  <div class="btns"><a class="btn" href="#/new">+ new note</a></div>
  <div class="meta">${online() ? 'notes save to the repo (synced).' : 'no token set — new notes save on this device only. add a token in [s]et to sync.'} link readings or concepts with <code>[[id]]</code>.</div>
  ${ns.map(noteRow).join('') || empty('no notes yet')}`;
}
function vNote(v, id) {
  const n = S.notes.find(x => x.id === id); if (!n) return vNotFound(v);
  const refs = noteRefs(n);
  v.innerHTML = `<div class="meta">${esc(n.date || '')}${n.topic ? ` · <a href="#/topic/${n.topic}">topic ${n.topic}</a>` : ''} · ${n.src === 'local' ? 'local (this device)' : 'repo'}</div>
  <div class="btns">
    ${n.src === 'local' || online() ? `<a class="btn" href="#/new/${encodeURIComponent(n.id)}">edit</a>` : ''}
    <button class="btn" data-act="copy" data-id="${esc(n.id)}">copy md</button>
    ${n.src === 'local' && online() ? `<button class="btn" data-act="push" data-id="${esc(n.id)}">push to repo</button>` : ''}
    ${n.src === 'local' ? `<button class="btn" data-act="del" data-id="${esc(n.id)}">delete</button>` : ''}
  </div>
  ${/^#\s/.test(n.body || '') ? '' : `<h1>${esc(n.title)}</h1>`}
  ${md(n.body)}
  ${refs.length ? `<h2>links</h2>${refs.map(entLink).map(l => `<div>${l}</div>`).join('')}` : ''}`;
}

function vCompose(v, id) {
  const n = id ? S.notes.find(x => x.id === id) : null;
  const qw = +(new URLSearchParams(location.hash.split('?')[1] || '').get('topic'));
  const draft = n ? null : LS.get('lga.draft', null);
  const d = n || draft || { title: '', date: today(), topic: qw || currentTopic(), body: '' };
  const ids = [...S.course.readings.map(r => [r.id, rShort(r)]), ...S.course.concepts.map(c => [c.id, c.name])];
  v.innerHTML = `<h1>${n ? 'edit note' : 'new lecture note'}</h1>
  <div class="grid2">
    <div><label class="l" for="nt">title</label><input class="f" id="nt" value="${esc(d.title)}" placeholder="Lecture 9 — ..."></div>
    <div class="grid2" style="grid-template-columns:1fr 1fr">
      <div><label class="l" for="nd">date</label><input class="f" id="nd" type="date" value="${esc(d.date)}"></div>
      <div><label class="l" for="nw">topic</label><select class="f" id="nw">${S.course.topics.map(t => `<option value="${t.n}" ${+d.topic === t.n ? 'selected' : ''}>t${t.n} · ${esc(t.title.slice(0, 30))}</option>`).join('')}</select></div>
    </div>
  </div>
  <label class="l" for="nb">notes <span class="dim">(markdown · [[id]] links a reading/concept)</span></label>
  ${ids.length ? `<div class="ids">${ids.map(([i, l]) => `<button type="button" data-ins="${esc(i)}">[[${esc(l)}]]</button>`).join('')}</div>` : ''}
  <textarea class="f" id="nb" spellcheck="true" placeholder="- main claim...">${esc(d.body)}</textarea>
  <div class="btns">
    <button class="btn" data-act="save">${online() ? 'save → repo' : 'save (this device)'}</button>
    <button class="btn" data-act="preview">preview</button>
    <a class="btn" href="#/notes">cancel</a>
  </div>
  <div id="pv"></div>`;
  const nb = $('#nb');
  const keep = () => { if (!n) LS.set('lga.draft', { title: $('#nt').value, date: $('#nd').value, topic: +$('#nw').value, body: nb.value }); };
  v.oninput = keep;
  v.querySelectorAll('[data-ins]').forEach(b => b.onclick = () => {
    const t = `[[${b.dataset.ins}]]`, p = nb.selectionStart ?? nb.value.length;
    nb.value = nb.value.slice(0, p) + t + nb.value.slice(nb.selectionEnd ?? p); nb.focus(); nb.selectionStart = nb.selectionEnd = p + t.length; keep();
  });
  v.querySelector('[data-act=preview]').onclick = () => { $('#pv').innerHTML = `<hr>${md(nb.value)}`; };
  v.querySelector('[data-act=save]').onclick = async e => {
    const data = { title: $('#nt').value.trim() || 'untitled', date: $('#nd').value || today(), topic: +$('#nw').value, body: nb.value };
    e.target.disabled = true; e.target.textContent = 'saving…';
    try {
      const saved = await saveNote(n, data);
      LS.set('lga.draft', null); v.oninput = null;
      location.hash = '#/n/' + encodeURIComponent(saved.id);
    } catch (err) { toast('save failed: ' + err.message); e.target.disabled = false; e.target.textContent = 'retry save'; }
  };
}

async function saveNote(existing, data) {
  if (online() && (!existing || existing.src === 'repo')) {
    const file = existing?.file || `${data.date}-${slug(data.title)}.md`;
    const body = /^#\s/.test(data.body) ? data.body : `# ${data.title}\n\n${data.body}`;
    await ghPut('notes/' + file, body, `note: ${data.title}`);
    const idx = S.notes.filter(x => x.src === 'repo' && x.file !== file).map(({ file, title, date, topic, links }) => ({ file, title, date, topic, ...(links ? { links } : {}) }));
    idx.push({ file, title: data.title, date: data.date, topic: data.topic });
    idx.sort((a, b) => a.date.localeCompare(b.date));
    await ghPut('notes/index.json', JSON.stringify(idx, null, 2) + '\n', `notes index: ${data.title}`);
    S.notes = S.notes.filter(x => x.id !== file && x !== existing);
    const rec = { ...data, body, file, id: file, src: 'repo' };
    S.notes.push(rec);
    if (existing?.src === 'local') dropLocal(existing.id);
    toast('saved to repo ✓');
    return rec;
  }
  const local = LS.get('lga.notes', []);
  const id = existing?.id || 'local-' + Date.now().toString(36);
  const rec = { ...data, id };
  LS.set('lga.notes', [...local.filter(x => x.id !== id), rec]);
  S.notes = [...S.notes.filter(x => x.id !== id), { ...rec, src: 'local' }];
  toast('saved on this device');
  return rec;
}
function dropLocal(id) {
  LS.set('lga.notes', LS.get('lga.notes', []).filter(x => x.id !== id));
  S.notes = S.notes.filter(x => !(x.src === 'local' && x.id === id));
}

function vMap(v) {
  const c = S.course, maxT = +(LS.get('lga.maptopic', 0)) || c.topics.length || 1, all = LS.get('lga.mapall', false);
  const linked = new Set(c.connections.flatMap(x => [x.from, x.to]));
  const rs = c.readings.filter(r => r.topic <= maxT && (all || linked.has(r.id)));
  const idx = Object.fromEntries(rs.map((r, i) => [r.id, i]));
  const edges = c.connections.filter(e => e.from in idx && e.to in idx);
  v.innerHTML = `<h1>connection map</h1>
  <div class="btns">
    <label class="dim">up to topic <select class="f" id="mw" style="width:auto;display:inline-block;font-size:14px;padding:1px 4px">${c.topics.map(t => `<option ${t.n === maxT ? 'selected' : ''}>${t.n}</option>`).join('')}</select></label>
    <button class="btn ${all ? 'on' : ''}" id="ma">${all ? 'all readings' : 'connected only'}</button>
  </div>
  <div class="meta">readings in course order, top → bottom. each arc is an argued connection. hover or tap an arc to see it; tap a title to open.</div>
  <div id="arcinfo" class="box" style="min-height:3.2em"><span class="dim">// select an arc</span></div>
  ${rs.length ? `<div class="mapwrap" id="mapbox"></div>` : empty('the map fills in as connections are added')}
  ${c.connections.length ? `<h2>all connections by type</h2>${Object.keys(RELATIONS).concat([...new Set(c.connections.map(x => x.type))].filter(t => !RELATIONS[t]))
      .map(t => [t, c.connections.filter(x => x.type === t)]).filter(([, l]) => l.length)
      .map(([t, l]) => `<h3>${esc(RELATIONS[t] || t)}</h3>${l.map(x => `<div class="edge">${entLink(x.from)} <span class="rel">──▶</span> ${entLink(x.to)}${x.note ? `<div class="note">${esc(x.note)}</div>` : ''}</div>`).join('')}`).join('')}` : ''}`;
  $('#mw').onchange = e => { LS.set('lga.maptopic', +e.target.value); route(); };
  $('#ma').onclick = () => { LS.set('lga.mapall', !all); route(); };
  const box = $('#mapbox'); if (!box) return;
  box.innerHTML = arcSVG(rs, edges, idx, box.clientWidth);
  const svg = box.querySelector('svg'), info = $('#arcinfo');
  const show = (ei) => {
    svg.classList.add('focus'); svg.querySelectorAll('.hl').forEach(x => x.classList.remove('hl'));
    const e = edges[ei];
    svg.querySelector(`.e[data-i="${ei}"]`).classList.add('hl');
    [e.from, e.to].forEach(id => svg.querySelector(`.nd[data-i="${idx[id]}"]`).classList.add('hl'));
    info.innerHTML = `${entLink(e.from)} <span class="rel">──${esc(RELATIONS[e.type] || e.type)}──▶</span> ${entLink(e.to)}${e.note ? `<div class="dim">${esc(e.note)}</div>` : ''}`;
  };
  const showNode = i => {
    svg.classList.add('focus'); svg.querySelectorAll('.hl').forEach(x => x.classList.remove('hl'));
    svg.querySelector(`.nd[data-i="${i}"]`).classList.add('hl');
    edges.forEach((e, ei) => { if (idx[e.from] === i || idx[e.to] === i) { svg.querySelector(`.e[data-i="${ei}"]`).classList.add('hl'); svg.querySelector(`.nd[data-i="${idx[e.from] === i ? idx[e.to] : idx[e.from]}"]`).classList.add('hl'); } });
  };
  const clear = () => { svg.classList.remove('focus'); svg.querySelectorAll('.hl').forEach(x => x.classList.remove('hl')); };
  svg.querySelectorAll('.e').forEach(p => { p.onmouseenter = p.onclick = () => show(+p.dataset.i); p.onmouseleave = clear; });
  svg.querySelectorAll('.nd').forEach(g => { g.onmouseenter = () => showNode(+g.dataset.i); g.onmouseleave = clear; g.onclick = () => location.hash = `#/r/${rs[+g.dataset.i].id}`; });
}

function arcSVG(rs, edges, idx, W) {
  W = Math.max(320, W || 800);
  const RH = 21, top = 18, H = top * 2 + rs.length * RH;
  const span = Math.max(1, ...edges.map(e => Math.abs(idx[e.from] - idx[e.to]))) * RH / 2;
  const X = Math.round(Math.min(W * .32, Math.max(60, span * .55) + 12)), maxCh = Math.floor((W - X - 44) / 7.2);
  const y = i => top + i * RH + RH / 2;
  let lastT = 0;
  const rows = rs.map((r, i) => {
    const sep = r.topic !== lastT; lastT = r.topic;
    let lbl = (r.author ? r.author.replace(/ \(.*\)/, '') + ' — ' : '') + r.title;
    if (lbl.length > maxCh) lbl = lbl.slice(0, maxCh - 1) + '…';
    return `${sep ? `<line x1="${X}" x2="${W - 4}" y1="${y(i) - RH / 2}" y2="${y(i) - RH / 2}" stroke="var(--faint)"/>` : ''}
      <g class="nd" data-i="${i}"><title>${esc(r.title)}</title>
      <rect x="${X}" y="${y(i) - RH / 2}" width="${W - X}" height="${RH}" fill="transparent" stroke="none"/>
      <text class="lbl" x="${X + 6}" y="${y(i) + 4}">${sep ? 't' + String(r.topic).padStart(2, '0') : ''}</text>
      <circle cx="${X}" cy="${y(i)}" r="3"/>
      <text x="${X + 38}" y="${y(i) + 4}">${esc(lbl)}</text></g>`;
  }).join('');
  const arcs = edges.map((e, i) => {
    const a = y(idx[e.from]), b = y(idx[e.to]), ry = Math.abs(b - a) / 2, rx = Math.min(X - 8, ry * .55 + 6);
    return `<path class="e" data-i="${i}" d="M${X},${a} A${rx},${ry} 0 0,${a < b ? 0 : 1} ${X},${b}"/>`;
  }).join('');
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${arcs}${rows}</svg>`;
}

function vSearch(v, q) {
  q = q.trim(); const re = q && new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const snip = s => { s = String(s || ''); const m = re && s.search(re); if (m == null || m < 0) return ''; const a = Math.max(0, m - 50); return esc((a ? '…' : '') + s.slice(a, m + 90).replace(/\s+/g, ' ')) + '…'; };
  const hay = r => [r.title, r.author, r.tldr, r.summary, (r.arguments || []).join(' '), r.context].join(' ');
  const R = S.course.readings.filter(r => re.test(hay(r))), C = S.course.concepts.filter(c => re.test(c.name + ' ' + (c.short || '') + ' ' + (c.definition || ''))), N = S.notes.filter(n => re.test(n.title + ' ' + n.body));
  const G = re.test(S.guide);
  v.innerHTML = `<h1>grep "${esc(q)}"</h1><div class="meta">${R.length + C.length + N.length + (G ? 1 : 0)} hits</div>
  ${R.length ? `<h2>readings</h2>${R.map(r => readingRow(r) + `<div class="meta" style="padding-left:4ch">${snip(hay(r))}</div>`).join('')}` : ''}
  ${C.length ? `<h2>concepts</h2>${C.map(c => `<div><a href="#/c/${esc(c.id)}">${esc(c.name)}</a></div>`).join('')}` : ''}
  ${N.length ? `<h2>notes</h2>${N.map(n => noteRow(n) + `<div class="meta" style="padding-left:4ch">${snip(n.body)}</div>`).join('')}` : ''}
  ${G ? `<h2>study guide</h2><div><a href="#/guide">study guide</a></div><div class="meta">${snip(S.guide)}</div>` : ''}
  ${!q ? empty('type something to search') : ''}`;
}

function vSettings(v) {
  const s = S.settings;
  v.innerHTML = `<h1>settings</h1>
  <h2>theme</h2><div class="btns">${['green', 'amber', 'mono'].map(t => `<button class="btn ${s.theme === t ? 'on' : ''}" data-theme="${t}">${t}</button>`).join('')}</div>
  <h2>sync via github</h2>
  <p class="dim">Without a token, progress and new notes stay on this device. With a GitHub token they are committed to the repo, so mac and phone stay in sync. Create a fine-grained token with <i>Contents: read &amp; write</i> on this repo only.</p>
  <label class="l" for="tk">token</label><input class="f" id="tk" type="password" value="${esc(s.token)}" placeholder="github_pat_…" autocomplete="off">
  <div class="grid2"><div><label class="l" for="rp">repo</label><input class="f" id="rp" value="${esc(s.repo)}"></div><div><label class="l" for="br">branch</label><input class="f" id="br" value="${esc(s.branch)}"></div></div>
  <div class="btns"><button class="btn" data-act="saveset">save &amp; reload</button></div>
  <h2>this device</h2>
  <div class="btns"><button class="btn" data-act="export">export local notes (.md)</button>${online() ? '<button class="btn" data-act="pushall">push local notes + progress to repo</button>' : ''}</div>
  <div class="meta">${S.notes.filter(n => n.src === 'local').length} local notes</div>`;
}

function vHelp(v) {
  v.innerHTML = `<h1>help</h1><pre>
keys       d w r c m g n s   jump to view
           /                 focus the prompt
prompt     &lt;text&gt;            search everything
           cd &lt;view&gt;         dash topics readings concepts map guide notes settings
           t &lt;n&gt;             open topic n
           open &lt;id&gt;         open reading/concept by id
           new               new lecture note
           theme &lt;name&gt;      green | amber | mono
status     [ ] todo  [~] reading  [x] read  [*] reviewed
notes      write [[reading-id]] or [[concept-id]] to link
</pre>`;
}
function vNotFound(v) { v.innerHTML = `<p>bash: ${esc(location.hash)}: no such file or directory</p><p><a href="#/">cd ~</a></p>`; }

/* ---------- router ---------- */
const ROUTES = [
  [/^$/, vDash, ''], [/^topics$/, vTopics, 'topics'], [/^topic\/(\d+)$/, vTopic, 'topics'], [/^readings$/, vReadings, 'readings'],
  [/^r\/(.+)$/, vReading, 'readings'], [/^concepts$/, vConcepts, 'concepts'], [/^c\/(.+)$/, vConcept, 'concepts'],
  [/^map$/, vMap, 'map'], [/^guide$/, vGuide, 'guide'], [/^notes$/, vNotes, 'notes'], [/^n\/(.+)$/, vNote, 'notes'],
  [/^new(?:\/(.+))?$/, vCompose, 'notes'], [/^search\/(.*)$/, vSearch, ''], [/^settings$/, vSettings, 'settings'], [/^help$/, vHelp, ''],
];
function route() {
  const h = location.hash.replace(/^#\/?/, '').split('?')[0];
  const v = $('#view'); v.oninput = null;
  for (const [re, fn, nav] of ROUTES) {
    const m = h.match(re); if (!m) continue;
    fn(v, ...m.slice(1).map(x => x == null ? x : decodeURIComponent(x)));
    $('#cwd').textContent = '~' + (h ? '/' + decodeURIComponent(h) : '');
    document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#/' + nav));
    if (!route.keepScroll) window.scrollTo(0, 0);
    return;
  }
  vNotFound(v);
}
function rerender() { route.keepScroll = true; const y = scrollY; route(); scrollTo(0, y); route.keepScroll = false; }

/* ---------- events ---------- */
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-status],[data-set],[data-act],[data-theme],[data-current],[data-deliv]'); if (!t) return;
  if (t.dataset.current) { setStatus('__current', null, { n: +t.dataset.current }); return rerender(); }
  if (t.dataset.deliv) {
    const k = 'd:' + t.dataset.deliv, cur = S.progress[k]?.s || 'todo', nx = { todo: 'reading', reading: 'read', read: 'todo', reviewed: 'todo' }[cur];
    setStatus(k, nx); return rerender();
  }
  if (t.dataset.status) {
    const id = t.dataset.status, i = STATUSES.findIndex(s => s[0] === status(id));
    setStatus(id, STATUSES[(i + 1) % STATUSES.length][0]); return rerender();
  }
  if (t.dataset.set) { setStatus(t.dataset.set, t.dataset.s); return rerender(); }
  if (t.dataset.theme) { S.settings.theme = t.dataset.theme; LS.set('lga.settings', S.settings); applyTheme(); return rerender(); }
  const act = t.dataset.act, n = S.notes.find(x => x.id === t.dataset.id);
  if (act === 'copy' && n) { await navigator.clipboard?.writeText(n.body).catch(() => { }); toast('copied'); }
  if (act === 'del' && n && confirm('delete this local note?')) { dropLocal(n.id); location.hash = '#/notes'; }
  if (act === 'push' && n) { try { const r = await saveNote(null, n); dropLocal(n.id); location.hash = '#/n/' + encodeURIComponent(r.id); } catch (err) { toast(err.message); } }
  if (act === 'saveset') {
    Object.assign(S.settings, { token: $('#tk').value.trim(), repo: $('#rp').value.trim(), branch: $('#br').value.trim() || 'main' });
    LS.set('lga.settings', S.settings); location.reload();
  }
  if (act === 'export') {
    const ls = S.notes.filter(x => x.src === 'local');
    const blob = new Blob([ls.map(x => `# ${x.title}\n_${x.date} · topic ${x.topic}_\n\n${x.body}\n`).join('\n---\n\n')], { type: 'text/markdown' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `lga-notes-${today()}.md`; a.click();
  }
  if (act === 'pushall') {
    t.disabled = true;
    for (const x of S.notes.filter(y => y.src === 'local')) { try { await saveNote(null, x); dropLocal(x.id); } catch (err) { toast(err.message); break; } }
    await pushProgress(); rerender();
  }
});

document.addEventListener('change', e => {
  const d = e.target.dataset?.deltopic; if (d) setStatus('d:' + d, null, { topic: +e.target.value || null });
});

$('#cmd').addEventListener('submit', e => {
  e.preventDefault();
  const inp = $('#cmdin'), raw = inp.value.trim(); inp.value = ''; inp.blur();
  const [cmd, ...rest] = raw.split(/\s+/), arg = rest.join(' ');
  const views = { dash: '', home: '', '~': '', topics: 'topics', readings: 'readings', concepts: 'concepts', map: 'map', guide: 'guide', notes: 'notes', settings: 'settings', help: 'help' };
  if (!raw) return;
  if (raw === 'help' || raw === '?') location.hash = '#/help';
  else if ((cmd === 'cd' || cmd === 'ls') && arg in views) location.hash = '#/' + views[arg];
  else if (raw in views) location.hash = '#/' + views[raw];
  else if ((cmd === 't' || cmd === 'topic') && /^\d+$/.test(arg)) location.hash = '#/topic/' + arg;
  else if (cmd === 'open' && ent(arg)) location.hash = `#/${ent(arg).kind}/${arg}`;
  else if (raw === 'new' || raw === 'note') location.hash = '#/new';
  else if (cmd === 'theme' && ['green', 'amber', 'mono'].includes(arg)) { S.settings.theme = arg; LS.set('lga.settings', S.settings); applyTheme(); }
  else location.hash = '#/search/' + encodeURIComponent(raw);
});

document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) {
    if (e.key === 'Escape') document.activeElement.blur(); return;
  }
  if (e.key === '/') { e.preventDefault(); $('#cmdin').focus(); return; }
  if (e.key === '?') { location.hash = '#/help'; return; }
  const a = document.querySelector(`#nav a[data-k="${e.key}"]`); if (a) location.hash = a.getAttribute('href');
});

function applyTheme() { document.body.className = S.settings.theme === 'green' ? '' : S.settings.theme; }

(async () => {
  applyTheme();
  try { await load(); }
  catch (err) { $('#view').innerHTML = `<p>boot failed: ${esc(err.message)}</p><p class="dim">check data/course.json${online() ? ' or the token in settings' : ''}.</p>`; return; }
  syncMsg(online() ? `synced · ${S.settings.repo}` : 'local mode');
  window.addEventListener('hashchange', route);
  route();
})();
