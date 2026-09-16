/*
 * DraftBuzz collector — runs inside YOUR browser tab on nfldraftbuzz.com.
 *
 * Started from the bookmarklet on /admin/draftbuzz. It reads the site's pages
 * the same way you do (same session, same connection), parses each player
 * profile, and posts the results to your admin site with a short-lived run code.
 * It never solves or bypasses Cloudflare: if the site asks you to verify, the
 * collector stops and tells you to do it, and a re-run resumes where it left off.
 *
 * Parsing is label-based ("Last Updated:", "RELEASE SPEED:", ...) rather than
 * tied to row positions, and sends labels as-is; mapping them onto database
 * columns happens server-side (src/lib/draftbuzz/mapping.ts).
 */
(() => {
  "use strict";

  const API_ORIGIN = new URL(document.currentScript.src).origin;
  const API = `${API_ORIGIN}/api/draftbuzz/collect`;
  const DELAY_MS = 800;       // pause between DraftBuzz requests
  const BATCH_SIZE = 10;      // profiles per upload
  const MAX_LIST_PAGES = 150; // safety stop; the ALL list was 29 pages in Sep 2026

  if (!/(^|\.)nfldraftbuzz\.com$/i.test(location.hostname)) {
    alert("Open nfldraftbuzz.com first, then click the DraftBuzz collector bookmark.");
    return;
  }
  if (window.__draftbuzzCollector) {
    window.__draftbuzzCollector.show();
    return;
  }

  // ─── Parsing ──────────────────────────────────────────────────────────────

  const text = (el) => (el && el.textContent ? el.textContent : "").replace(/\s+/g, " ").trim();
  const safe = (fn, fallback) => { try { return fn(); } catch { return fallback; } };

  class ChallengeError extends Error {}

  async function fetchDoc(path) {
    const res = await fetch(path, { credentials: "same-origin", cache: "no-store" });
    const html = await res.text();
    const challenged =
      res.status === 403 || res.status === 503 ||
      !!res.headers.get("cf-mitigated") ||
      /<title>\s*Just a moment/i.test(html);
    if (challenged) throw new ChallengeError("DraftBuzz is asking for verification.");
    if (!res.ok) throw new Error(`DraftBuzz returned HTTP ${res.status} for ${path}`);
    return new DOMParser().parseFromString(html, "text/html");
  }

  const CODE_RE = /^[A-Z]{1,5}(\/[A-Z]{1,5})?$/;

  function parseList(doc) {
    return [...doc.querySelectorAll('tr[data-href^="/Player/"]')].map((tr) => {
      const first = text(tr.querySelector(".firstName"));
      const last = text(tr.querySelector("span.lastName"));
      const cells = [...tr.cells].map(text);
      const code = CODE_RE.test(cells[3] || "") ? cells[3] : cells.find((c) => CODE_RE.test(c)) || "";
      return {
        url: tr.getAttribute("data-href").split("?")[0],
        code,
        name: [first, last].filter(Boolean).join(" ") || text(tr.querySelector(".team-meta__name")),
      };
    });
  }

  function findTable(doc, headerRe) {
    return [...doc.querySelectorAll("table.starRatingTable")].find((t) => headerRe.test(text(t.tHead)));
  }

  function sectionText(h5) {
    const parts = [];
    for (let n = h5.nextSibling; n; n = n.nextSibling) {
      if (n.nodeType === 1 && (n.matches("h5.proNegHeader") || n.querySelector("h5.proNegHeader"))) break;
      if (n.nodeType === 3) { const t = n.textContent.replace(/\s+/g, " ").trim(); if (t) parts.push(t); continue; }
      if (n.nodeType !== 1 || /^(SCRIPT|STYLE|INS|IFRAME)$/.test(n.tagName)) continue;
      const items = n.matches("ul, ol") ? [...n.querySelectorAll("li")] : [];
      if (items.length) parts.push(items.map((li) => `• ${text(li)}`).join("\n"));
      else { const t = text(n); if (t) parts.push(t); }
    }
    return parts.join("\n");
  }

  function parseProfile(doc, entry) {
    const fields = {};
    const ratings = {};
    doc.querySelectorAll("span").forEach((s) => {
      const t = text(s);
      if (/^[^:]{2,40}:$/.test(t)) {
        const next = s.nextElementSibling;
        const key = t.slice(0, -1).trim();
        if (next && next.tagName === "SPAN" && !(key in fields)) fields[key] = text(next);
      } else if (s.children.length === 0) {
        const m = t.match(/^((?:ESPN|247|RIVALS)[^:]{0,20}RATING)\s*:\s*(.+)$/i);
        if (m && !(m[1] in ratings)) ratings[m[1].toUpperCase()] = m[2];
      }
    });

    const gradesTable = findTable(doc, /OVERALL RATING/i);
    const grades = {};
    if (gradesTable) {
      gradesTable.querySelectorAll("tbody > tr").forEach((tr) => {
        const label = text(tr.cells[0]);
        const value = text(tr.cells[2]);
        if (tr.cells.length >= 3 && /:$/.test(label) && value) grades[label.slice(0, -1).trim().toUpperCase()] = value;
      });
    }
    const overallRating = gradesTable
      ? ([...gradesTable.tHead.querySelectorAll("span")].map(text).find((t) => /\d\s*\/\s*100/.test(t)) || "")
      : "";

    const compTable = findTable(doc, /PLAYER COMPARISON/i);
    const comps = compTable
      ? [...compTable.querySelectorAll("tbody > tr")].map((tr) => {
          const [name, ...school] = text(tr.cells[0]).split(" - ");
          return { name: (name || "").trim(), school: school.join(" - ").trim(), similarity: text(tr.cells[tr.cells.length - 1]) };
        }).filter((c) => c.name)
      : [];

    const qbrCell = [...doc.querySelectorAll("td")].find((td) => td.children.length === 0 && /QB Rating When targeted/i.test(td.textContent));

    return {
      url: entry.url,
      listCode: entry.code,
      name: entry.name,
      heading: text(doc.querySelector("h1.post__title_Player") || doc.querySelector("h1")),
      fields,
      ratings,
      overallRating,
      grades,
      qbrWhenTargeted: qbrCell ? text(qbrCell.nextElementSibling) : "",
      comps,
      sections: safe(() => [...doc.querySelectorAll("h5.proNegHeader")].map((h5) => ({ title: text(h5), text: sectionText(h5) })), []),
    };
  }

  // ─── Overlay UI ───────────────────────────────────────────────────────────

  const box = document.createElement("div");
  box.setAttribute("style", [
    "position:fixed", "top:16px", "right:16px", "z-index:2147483647", "width:340px",
    "background:#0d1320", "color:#e5e7eb", "border:1px solid #2a3a4e", "border-radius:12px",
    "box-shadow:0 10px 30px rgba(0,0,0,.5)", "font:13px/1.45 system-ui,-apple-system,Segoe UI,sans-serif", "padding:14px",
  ].join(";"));
  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <strong style="font-size:14px;color:#fff">DraftBuzz collector</strong>
      <button data-x="close" style="all:unset;cursor:pointer;color:#9ca3af;font-size:16px;padding:0 4px" title="Hide">×</button>
    </div>
    <div data-x="setup">
      <label style="display:block;color:#9ca3af;margin-bottom:4px">Run code from your admin page</label>
      <input data-x="code" placeholder="XXXX-XXXX-XXXX" autocomplete="off" spellcheck="false"
        style="width:100%;box-sizing:border-box;background:#1a2332;color:#fff;border:1px solid #2a3a4e;border-radius:8px;padding:8px;font:inherit;letter-spacing:1px;text-transform:uppercase">
      <button data-x="start" style="margin-top:8px;width:100%;background:#f97316;color:#fff;border:0;border-radius:8px;padding:8px;font:inherit;font-weight:600;cursor:pointer">Start collecting</button>
    </div>
    <div data-x="run" style="display:none">
      <div data-x="status" style="color:#fff;margin-bottom:6px"></div>
      <div style="height:6px;background:#1a2332;border-radius:99px;overflow:hidden"><div data-x="bar" style="height:100%;width:0;background:#f97316;transition:width .3s"></div></div>
      <div data-x="detail" style="color:#9ca3af;margin-top:6px"></div>
      <div data-x="warn" style="display:none;color:#facc15;margin-top:6px">Keep this tab open and in front — Chrome slows down background tabs.</div>
      <button data-x="stop" style="margin-top:10px;width:100%;background:transparent;color:#d1d5db;border:1px solid #2a3a4e;border-radius:8px;padding:7px;font:inherit;cursor:pointer">Stop</button>
    </div>`;
  document.body.appendChild(box);
  const $ = (k) => box.querySelector(`[data-x="${k}"]`);

  let stopped = false;
  let running = false;

  const ui = {
    status(msg, color) { $("status").textContent = msg; $("status").style.color = color || "#fff"; },
    detail(msg) { $("detail").textContent = msg; },
    progress(done, total) { $("bar").style.width = total ? `${Math.round((done / total) * 100)}%` : "0"; },
    finish(label) { $("stop").textContent = label; },
  };

  $("close").onclick = () => { box.style.display = "none"; };
  $("stop").onclick = () => {
    if (running) { stopped = true; ui.status("Stopping after the current page…", "#facc15"); }
    else { box.remove(); delete window.__draftbuzzCollector; }
  };
  document.addEventListener("visibilitychange", () => { $("warn").style.display = document.hidden && running ? "block" : "none"; });
  window.__draftbuzzCollector = { show: () => { box.style.display = "block"; } };

  // ─── Admin API ────────────────────────────────────────────────────────────

  let code = "";
  async function api(action, payload) {
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(API, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${code}` },
          body: JSON.stringify({ action, ...payload }),
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok) return body;
        lastErr = new Error(body.error || `Admin site returned HTTP ${res.status}`);
        if (res.status < 500) break; // bad code, expired run, etc. — retrying won't help
      } catch {
        lastErr = new Error(`Could not reach your admin site (${API_ORIGIN}).`);
      }
      await sleep(1500 * (attempt + 1));
    }
    throw lastErr;
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ─── Run ──────────────────────────────────────────────────────────────────

  async function run() {
    code = $("code").value.trim();
    if (!code) { $("code").focus(); return; }
    $("setup").style.display = "none";
    $("run").style.display = "block";
    running = true;
    ui.status("Connecting to your admin site…");

    try {
      const start = await api("start", {});
      const year = start.draftYear;
      let manifest = start.manifest;

      // 1. Every player on the ALL list (pages past the end repeat the last page,
      //    so stop when a page adds nothing new — not when it's empty).
      if (!manifest) {
        const seen = new Map();
        const codes = {};
        let pages = 0;
        for (let page = 1; page <= MAX_LIST_PAGES && !stopped; page++) {
          ui.status(`Reading player list, page ${page}…`);
          ui.detail(`${seen.size} players found so far`);
          const rows = parseList(await fetchDoc(`/positions/ALL/${page}/${year}`));
          pages++;
          const fresh = rows.filter((r) => !seen.has(r.url));
          fresh.forEach((r) => { seen.set(r.url, r); codes[r.code || "(none)"] = (codes[r.code || "(none)"] || 0) + 1; });
          if (fresh.length === 0) break;
          await sleep(DELAY_MS);
        }
        if (stopped) throw new Error("Stopped before the player list was complete. Click the bookmark again to restart.");
        manifest = [...seen.values()];
        if (!manifest.length) throw new Error(`No players found on the ${year} list. Check the draft year on your admin page.`);
        await api("manifest", { entries: manifest, listStats: { pages, players: manifest.length, codes } });
      }

      // 2. Profiles not yet received (resume-safe).
      const received = new Set(start.received || []);
      const todo = manifest.filter((e) => !received.has(e.url));
      const total = manifest.length;
      let done = total - todo.length;
      let batch = [];
      const flush = async () => {
        if (!batch.length) return;
        await api("batch", { profiles: batch });
        batch = [];
      };

      ui.progress(done, total);
      for (const entry of todo) {
        if (stopped) break;
        ui.status(`Collecting profiles: ${done + 1} of ${total}`);
        ui.detail(entry.name);
        const doc = await fetchDoc(entry.url);
        batch.push(parseProfile(doc, entry));
        done++;
        ui.progress(done, total);
        if (batch.length >= BATCH_SIZE) await flush();
        await sleep(DELAY_MS);
      }
      await flush();

      if (stopped) {
        ui.status(`Stopped at ${done} of ${total}. Everything collected so far is saved.`, "#facc15");
        ui.detail("Click the bookmark again with the same code to resume.");
      } else {
        await api("finish", {});
        ui.status(`Done — ${total} profiles collected.`, "#4ade80");
        ui.detail("Go back to your admin page to review the report and import.");
      }
    } catch (e) {
      if (e instanceof ChallengeError) {
        ui.status("DraftBuzz wants to verify you're human.", "#facc15");
        ui.detail("Reload this page, complete the check, then click the bookmark again with the same code. Progress is saved.");
      } else {
        ui.status(e.message || String(e), "#f87171");
        ui.detail("Progress so far is saved. Click the bookmark again with the same code to resume.");
      }
    } finally {
      running = false;
      $("warn").style.display = "none";
      ui.finish("Close");
    }
  }

  $("start").onclick = run;
  $("code").addEventListener("keydown", (e) => { if (e.key === "Enter") run(); });
  $("code").focus();
})();
