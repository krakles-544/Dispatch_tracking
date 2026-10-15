"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import type { Dispatch } from "@/lib/types";

const POLL_MS = 4000;

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { weekday: "short", day: "2-digit", month: "short" });
}
function isToday(iso: string) {
  const a = new Date(iso);
  const b = new Date();
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
// datetime-local inputs want local wall-clock "YYYY-MM-DDTHH:mm".
function toLocalInput(iso: string) {
  const d = new Date(iso);
  return new Date(+d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function fmtDuration(ms: number) {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  const parts: string[] = [];
  if (d > 0) parts.push(d + "d");
  if (h > 0) parts.push(h + "h");
  if (m > 0 || parts.length === 0) parts.push(m + "m");
  return parts.join(" ");
}

export default function Home() {
  const [records, setRecords] = useState<Dispatch[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [syncStatus, setSyncStatus] = useState("Connecting…");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [query, setQuery] = useState("");
  const [armedDelete, setArmedDelete] = useState<string | null>(null);
  const [armedReset, setArmedReset] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [csvFallback, setCsvFallback] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState({ invoice: "", started: "", first: "", last: "" });
  const [manualSaving, setManualSaving] = useState(false);
  const [timeEntry, setTimeEntry] = useState<{ id: string; value: string } | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armDeleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const toastRef = useRef<HTMLDivElement | null>(null);
  const prevStageRef = useRef<Map<string, string>>(new Map());

  function toast(msg: string) {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2200);
  }

  async function load() {
    try {
      const res = await fetch("/api/dispatches", { cache: "no-store" });
      if (!res.ok) throw new Error("bad status");
      const data = await res.json();
      setRecords(data.dispatches || []);
      setSyncStatus("Synced across your devices.");
      setLoaded(true);
    } catch {
      setSyncStatus("Connection lost — retrying…");
    }
  }

  useEffect(() => {
    load();
    const poll = setInterval(load, POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 30000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, []);

  useLayoutEffect(() => {
    if (prefersReducedMotion() || !wrapRef.current) return;
    const ctx = gsap.context(() => {
      const targets = gsap.utils.toArray<HTMLElement>(
        ".page-head, .stats .stat, .card, .section-head, .transit-list, .history-controls, .table-wrap, footer"
      );
      gsap.set(targets, { opacity: 0, y: 14 });
      gsap.to(targets, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out", stagger: 0.05 });
    }, wrapRef);
    return () => ctx.revert();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const nextStage = new Map<string, string>();
    const changed: string[] = [];
    for (const r of records) {
      const stage = r.last_arrived_at ? "done" : r.first_arrived_at ? "partial" : "transit";
      nextStage.set(r.id, stage);
      if (prevStageRef.current.get(r.id) !== stage) changed.push(r.id);
    }
    const isFirstPass = prevStageRef.current.size === 0;
    prevStageRef.current = nextStage;
    if (!changed.length || isFirstPass || prefersReducedMotion()) return;
    requestAnimationFrame(() => {
      changed.forEach((id) => {
        const el = wrapRef.current?.querySelector<HTMLElement>(`[data-row-id="${id}"]`);
        if (el) {
          gsap.fromTo(
            el,
            { opacity: 0, y: -10, scale: 0.98 },
            { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: "back.out(1.6)" }
          );
        }
      });
    });
  }, [records, loaded]);

  useEffect(() => {
    if (!toastRef.current) return;
    if (prefersReducedMotion()) {
      gsap.set(toastRef.current, { opacity: toastMsg ? 1 : 0, y: toastMsg ? -6 : 8 });
      return;
    }
    gsap.to(toastRef.current, {
      opacity: toastMsg ? 1 : 0,
      y: toastMsg ? -6 : 8,
      duration: 0.28,
      ease: toastMsg ? "back.out(1.7)" : "power1.in",
    });
  }, [toastMsg]);

  const inTransit = useMemo(
    () =>
      records
        .filter((r) => !r.first_arrived_at && !r.last_arrived_at)
        .sort((a, b) => +new Date(a.started_at) - +new Date(b.started_at)),
    [records]
  );
  const partiallyArrived = useMemo(
    () =>
      records
        .filter((r) => r.first_arrived_at && !r.last_arrived_at)
        .sort((a, b) => +new Date(a.first_arrived_at as string) - +new Date(b.first_arrived_at as string)),
    [records]
  );
  const completed = useMemo(
    () =>
      records
        .filter((r) => r.last_arrived_at)
        .sort((a, b) => +new Date(b.started_at) - +new Date(a.started_at)),
    [records]
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? completed.filter((r) => r.invoice_number.toLowerCase().includes(q)) : completed;
  }, [completed, query]);
  const todays = useMemo(() => completed.filter((r) => isToday(r.started_at)), [completed]);
  const avgToday =
    todays.length > 0
      ? fmtDuration(
          todays.reduce((sum, r) => sum + (+new Date(r.last_arrived_at as string) - +new Date(r.started_at)), 0) /
            todays.length
        )
      : "–";

  async function startDispatch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = invoiceNumber.trim();
    if (!trimmed) return;
    setInvoiceNumber("");
    try {
      const res = await fetch("/api/dispatches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_number: trimmed }),
      });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      setRecords((prev) => [data.dispatch, ...prev]);
      toast("Dispatch INV-" + trimmed + " started");
    } catch {
      toast("Could not save dispatch — try again");
    }
  }

  async function addManualEntry(e: React.FormEvent) {
    e.preventDefault();
    const invoice = manual.invoice.trim();
    if (!invoice || !manual.started) return;
    if (manual.last && !manual.first) {
      toast("Enter the first arrival time too");
      return;
    }
    // datetime-local values are local wall-clock time; convert to ISO here so the server stores the right instant.
    const toIso = (v: string) => (v ? new Date(v).toISOString() : undefined);
    const started_at = toIso(manual.started) as string;
    const first_arrived_at = toIso(manual.first);
    const last_arrived_at = toIso(manual.last);
    if ((first_arrived_at && first_arrived_at < started_at) || (last_arrived_at && first_arrived_at && last_arrived_at < first_arrived_at)) {
      toast("Times must be in order: out → first in → last in");
      return;
    }
    setManualSaving(true);
    try {
      const res = await fetch("/api/dispatches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_number: invoice, started_at, first_arrived_at, last_arrived_at }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "failed");
      }
      const data = await res.json();
      setRecords((prev) => [data.dispatch, ...prev]);
      setManual({ invoice: "", started: "", first: "", last: "" });
      toast("Entry INV-" + invoice + " added");
    } catch (err) {
      toast("Could not add entry — " + (err instanceof Error && err.message !== "failed" ? err.message : "try again"));
    } finally {
      setManualSaving(false);
    }
  }

  async function markArrived(rec: Dispatch, action: "first-arrive" | "last-arrive", at?: string) {
    try {
      const res = await fetch(`/api/dispatches/${rec.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, at }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "failed");
      }
      const data = await res.json();
      setRecords((prev) => prev.map((r) => (r.id === rec.id ? data.dispatch : r)));
      setTimeEntry(null);
      toast(
        action === "first-arrive"
          ? "First item for INV-" + rec.invoice_number + " arrived"
          : "INV-" + rec.invoice_number + " fully arrived — total duration " +
              fmtDuration(+new Date(data.dispatch.last_arrived_at) - +new Date(rec.started_at))
      );
    } catch (err) {
      toast("Could not update — " + (err instanceof Error && err.message !== "failed" ? err.message : "try again"));
    }
  }

  function saveEnteredTime(e: React.FormEvent, rec: Dispatch, action: "first-arrive" | "last-arrive") {
    e.preventDefault();
    if (!timeEntry?.value) return;
    markArrived(rec, action, new Date(timeEntry.value).toISOString());
  }

  function renderArrivalActions(rec: Dispatch, action: "first-arrive" | "last-arrive") {
    const label = action === "first-arrive" ? "First item arrived" : "Last item arrived";
    const after = action === "first-arrive" ? rec.started_at : (rec.first_arrived_at as string);
    if (timeEntry?.id === rec.id) {
      return (
        <form className="actions time-entry" onSubmit={(e) => saveEnteredTime(e, rec, action)}>
          <input
            type="datetime-local"
            aria-label={label + " at"}
            required
            min={toLocalInput(after)}
            max={toLocalInput(new Date(now).toISOString())}
            value={timeEntry.value}
            onChange={(e) => setTimeEntry({ id: rec.id, value: e.target.value })}
          />
          <button type="submit" className="btn btn-secondary btn-sm">Save</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTimeEntry(null)}>
            Cancel
          </button>
        </form>
      );
    }
    return (
      <div className="actions">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          title="Record the arrival at an earlier time"
          onClick={() => setTimeEntry({ id: rec.id, value: toLocalInput(new Date().toISOString()) })}
        >
          Enter time
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => markArrived(rec, action)}>
          {label}
        </button>
      </div>
    );
  }

  function armDelete(id: string) {
    setArmedDelete(id);
    if (armDeleteTimer.current) clearTimeout(armDeleteTimer.current);
    armDeleteTimer.current = setTimeout(() => setArmedDelete(null), 3000);
  }

  async function confirmDelete(id: string, rowEl: HTMLElement | null) {
    setArmedDelete(null);
    if (rowEl && !prefersReducedMotion()) {
      await new Promise<void>((resolve) => {
        gsap.to(rowEl, { opacity: 0, x: -24, duration: 0.28, ease: "power1.in", onComplete: () => resolve() });
      });
    }
    try {
      const res = await fetch(`/api/dispatches/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("failed");
      setRecords((prev) => prev.filter((r) => r.id !== id));
    } catch {
      toast("Could not delete — try again");
    }
  }

  function armReset() {
    setArmedReset(true);
    if (armResetTimer.current) clearTimeout(armResetTimer.current);
    armResetTimer.current = setTimeout(() => setArmedReset(false), 3500);
  }

  async function confirmReset() {
    setArmedReset(false);
    try {
      const res = await fetch("/api/dispatches", { method: "DELETE" });
      if (!res.ok) throw new Error("failed");
      setRecords([]);
      toast("All data cleared");
    } catch {
      toast("Could not clear — try again");
    }
  }

  async function copyCsv() {
    const rows = completed.map((r) =>
      [
        fmtDate(r.started_at),
        "INV-" + r.invoice_number,
        fmtTime(r.started_at),
        fmtTime(r.first_arrived_at as string),
        fmtTime(r.last_arrived_at as string),
        fmtDuration(+new Date(r.last_arrived_at as string) - +new Date(r.started_at)),
      ].join(",")
    );
    const csv = "Date,Invoice Number,Dispatched,First Arrived,Last Arrived,Duration\n" + rows.join("\n");
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(csv);
        setCsvFallback(null);
        toast("Copied " + rows.length + " row" + (rows.length === 1 ? "" : "s") + " to clipboard");
        return;
      }
      throw new Error("no clipboard api");
    } catch {
      setCsvFallback(csv);
      toast("Clipboard blocked — text selected, press Ctrl+C");
    }
  }

  return (
    <div className="wrap" ref={wrapRef}>
      <header className="page-head">
        <p className="eyebrow">Vintage Interiors Kenya · Dispatch Desk</p>
        <h1>Dispatch Log</h1>
      </header>

      <div className="stats">
        <div className="stat">
          <span className="num mono">{todays.length}</span>
          <span className="label">Dispatched today</span>
        </div>
        <div className="stat transit">
          <span className="num mono">{inTransit.length + partiallyArrived.length}</span>
          <span className="label">In transit</span>
        </div>
        <div className="stat">
          <span className="num mono">{avgToday}</span>
          <span className="label">Avg time today</span>
        </div>
      </div>

      <section>
        <div className="card">
          <form className="start-form" onSubmit={startDispatch}>
            <div className="field">
              <label htmlFor="invoiceInput">Invoice number</label>
              <input
                id="invoiceInput"
                name="invoice_number"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="e.g. 1042"
                required
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-primary">
              Start dispatch →
            </button>
          </form>
          <button
            type="button"
            className="manual-toggle"
            aria-expanded={manualOpen}
            aria-controls="manualForm"
            onClick={() => setManualOpen((o) => !o)}
          >
            {manualOpen ? "− Hide manual entry" : "+ Add a past entry manually"}
          </button>
          {manualOpen && (
            <form id="manualForm" className="manual-form" onSubmit={addManualEntry}>
              <div className="field">
                <label htmlFor="manualInvoice">Invoice number</label>
                <input
                  id="manualInvoice"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="e.g. 1042"
                  required
                  value={manual.invoice}
                  onChange={(e) => setManual((m) => ({ ...m, invoice: e.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="manualStarted">Dispatched</label>
                <input
                  id="manualStarted"
                  type="datetime-local"
                  required
                  value={manual.started}
                  onChange={(e) => setManual((m) => ({ ...m, started: e.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="manualFirst">First item arrived (optional)</label>
                <input
                  id="manualFirst"
                  type="datetime-local"
                  min={manual.started || undefined}
                  value={manual.first}
                  onChange={(e) => setManual((m) => ({ ...m, first: e.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="manualLast">Last item arrived (optional)</label>
                <input
                  id="manualLast"
                  type="datetime-local"
                  min={manual.first || manual.started || undefined}
                  disabled={!manual.first}
                  value={manual.last}
                  onChange={(e) => setManual((m) => ({ ...m, last: e.target.value }))}
                />
              </div>
              <p className="manual-hint">
                Leave the arrival times blank to put it in transit. Fill in both to add it straight to History.
              </p>
              <button type="submit" className="btn btn-primary" disabled={manualSaving}>
                {manualSaving ? "Saving…" : "Add entry"}
              </button>
            </form>
          )}
        </div>
      </section>

      <section>
        <div className="section-head">
          <h2>In transit</h2>
          <span className="count-chip mono">{inTransit.length}</span>
        </div>
        <div className="transit-list">
          {!loaded ? (
            <div className="empty-note">Loading…</div>
          ) : inTransit.length === 0 ? (
            <div className="empty-note">Nothing in transit right now.</div>
          ) : (
            inTransit.map((r) => (
              <div className="transit-row" key={r.id} data-row-id={r.id}>
                <div className="who">
                  <span className="note">INV-{r.invoice_number}</span>
                  <span className="since">left at {fmtTime(r.started_at)}</span>
                </div>
                <span className="elapsed mono">{fmtDuration(now - +new Date(r.started_at))}</span>
                {renderArrivalActions(r, "first-arrive")}
              </div>
            ))
          )}
        </div>
      </section>

      <section>
        <div className="section-head">
          <h2>Partially arrived</h2>
          <span className="count-chip mono">{partiallyArrived.length}</span>
        </div>
        <div className="transit-list">
          {partiallyArrived.length === 0 ? (
            <div className="empty-note">Nothing waiting on remaining items.</div>
          ) : (
            partiallyArrived.map((r) => (
              <div className="transit-row partial" key={r.id} data-row-id={r.id}>
                <div className="who">
                  <span className="note">INV-{r.invoice_number}</span>
                  <span className="since">first item at {fmtTime(r.first_arrived_at as string)}</span>
                </div>
                <span className="elapsed mono partial">
                  {fmtDuration(now - +new Date(r.first_arrived_at as string))}
                </span>
                {renderArrivalActions(r, "last-arrive")}
              </div>
            ))
          )}
        </div>
      </section>

      <section>
        <div className="section-head">
          <h2>History</h2>
          <span className="count-chip mono">{completed.length}</span>
        </div>
        <div className="history-controls">
          <input
            className="search-input"
            type="search"
            placeholder="Filter by invoice number…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="btn btn-ghost btn-sm" type="button" onClick={copyCsv}>
            Copy as CSV
          </button>
          <a className="btn btn-ghost btn-sm" href="/api/dispatches/export">
            Download Excel
          </a>
        </div>
        {csvFallback !== null && (
          <textarea
            id="csvFallback"
            readOnly
            value={csvFallback}
            ref={(el) => {
              if (el) {
                el.focus();
                el.select();
              }
            }}
          />
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Invoice #</th>
                <th>Out</th>
                <th>First in</th>
                <th>Last in</th>
                <th>Duration</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty-note" style={{ border: "none" }}>
                    {query ? `No dispatches match "${query}".` : "No completed dispatches yet."}
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} data-row-id={r.id}>
                    <td>{fmtDate(r.started_at)}</td>
                    <td className="note">INV-{r.invoice_number}</td>
                    <td className="time">{fmtTime(r.started_at)}</td>
                    <td className="time">{fmtTime(r.first_arrived_at as string)}</td>
                    <td className="time">{fmtTime(r.last_arrived_at as string)}</td>
                    <td className="duration">
                      {fmtDuration(+new Date(r.last_arrived_at as string) - +new Date(r.started_at))}
                    </td>
                    <td>
                      <button
                        className={`row-del${armedDelete === r.id ? " arm" : ""}`}
                        title="Delete entry"
                        onClick={(e) =>
                          armedDelete === r.id
                            ? confirmDelete(r.id, e.currentTarget.closest("tr"))
                            : armDelete(r.id)
                        }
                      >
                        {armedDelete === r.id ? "Delete?" : "✕"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <footer>
        <span>{syncStatus}</span>
        <button
          className={`reset-link${armedReset ? " arm" : ""}`}
          type="button"
          onClick={() => (armedReset ? confirmReset() : armReset())}
        >
          {armedReset ? "Click again to permanently clear everything" : "Clear all data"}
        </button>
      </footer>

      <div id="toast" ref={toastRef}>
        {toastMsg}
      </div>
    </div>
  );
}
