"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch } from "@/lib/types";

const POLL_MS = 4000;

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

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armDeleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  async function markFirstArrived(rec: Dispatch) {
    try {
      const res = await fetch(`/api/dispatches/${rec.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "first-arrive" }),
      });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      setRecords((prev) => prev.map((r) => (r.id === rec.id ? data.dispatch : r)));
      toast("First item for INV-" + rec.invoice_number + " arrived");
    } catch {
      toast("Could not update — try again");
    }
  }

  async function markLastArrived(rec: Dispatch) {
    try {
      const res = await fetch(`/api/dispatches/${rec.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "last-arrive" }),
      });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      setRecords((prev) => prev.map((r) => (r.id === rec.id ? data.dispatch : r)));
      toast(
        "INV-" + rec.invoice_number + " fully arrived — total duration " +
          fmtDuration(+new Date(data.dispatch.last_arrived_at) - +new Date(rec.started_at))
      );
    } catch {
      toast("Could not update — try again");
    }
  }

  function armDelete(id: string) {
    setArmedDelete(id);
    if (armDeleteTimer.current) clearTimeout(armDeleteTimer.current);
    armDeleteTimer.current = setTimeout(() => setArmedDelete(null), 3000);
  }

  async function confirmDelete(id: string) {
    setArmedDelete(null);
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
    <div className="wrap">
      <header className="page-head">
        <p className="eyebrow">Vintage Interiors Kenya · Dispatch Desk</p>
        <h1>Dispatch Log</h1>
        <p className="sub">
          Press start when a delivery leaves. Since a dispatch can hold several items, log when the first item
          lands and again when the last one does — duration is timestamped automatically from just the invoice
          number. Synced between your desktop and laptop.
        </p>
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
              <div className="transit-row" key={r.id}>
                <div className="who">
                  <span className="note">INV-{r.invoice_number}</span>
                  <span className="since">left at {fmtTime(r.started_at)}</span>
                </div>
                <span className="elapsed mono">{fmtDuration(now - +new Date(r.started_at))}</span>
                <div className="actions">
                  <button className="btn btn-secondary btn-sm" onClick={() => markFirstArrived(r)}>
                    First item arrived
                  </button>
                </div>
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
              <div className="transit-row partial" key={r.id}>
                <div className="who">
                  <span className="note">INV-{r.invoice_number}</span>
                  <span className="since">first item at {fmtTime(r.first_arrived_at as string)}</span>
                </div>
                <span className="elapsed mono partial">
                  {fmtDuration(now - +new Date(r.first_arrived_at as string))}
                </span>
                <div className="actions">
                  <button className="btn btn-secondary btn-sm" onClick={() => markLastArrived(r)}>
                    Last item arrived
                  </button>
                </div>
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
                  <tr key={r.id}>
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
                        onClick={() => (armedDelete === r.id ? confirmDelete(r.id) : armDelete(r.id))}
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

      <div id="toast" className={toastMsg ? "show" : ""}>
        {toastMsg}
      </div>
    </div>
  );
}
