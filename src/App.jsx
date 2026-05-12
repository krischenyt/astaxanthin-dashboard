import { useState, useEffect, useCallback, useMemo } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { supabase } from "./supabase";

const SKUs = [
  { key: "12mg_45",  label: "45ct",  color: "#f59e0b", asp: 18.76 },
  { key: "12mg_60",  label: "60ct",  color: "#10b981", asp: 24.28 },
  { key: "12mg_90",  label: "90ct",  color: "#6366f1", asp: 29.38 },
  { key: "12mg_120", label: "120ct", color: "#ef4444", asp: 34.24 },
];

// ── Helpers ───────────────────────────────────────────────────
function buildLookup(data) {
  const m = {};
  (data || []).forEach(r => { m[r.date] = r.sales; });
  return m;
}

function getDailyBaseline(data) {
  if (!data?.length) return 0;
  const recent = [...data].slice(-30);
  return Math.round(recent.reduce((s, r) => s + r.sales, 0) / recent.length);
}

function getMonthBaseline(data) {
  if (!data?.length) return 0;
  const m = {};
  data.forEach(r => { const mo = r.date.slice(0, 7); m[mo] = (m[mo] || 0) + r.sales; });
  const vals = Object.values(m).slice(0, -1);
  if (!vals.length) return Object.values(m)[0] || 0;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

function getMonthlyMap(data) {
  const m = {};
  (data || []).forEach(r => { const mo = r.date.slice(0, 7); m[mo] = (m[mo] || 0) + r.sales; });
  return m;
}

function fmt(n) { return (n || 0).toLocaleString(); }
function fmtDate(d) { return d ? d.slice(5) : ""; }

// ── Styles ────────────────────────────────────────────────────
//update
const s = {
  root: { background: "#0a0f1e", minHeight: "100vh", fontFamily: "'DM Sans', sans-serif", color: "#e2e8f0" },
  hdr: { background: "linear-gradient(135deg,#111827,#0a0f1e)", borderBottom: "1px solid #1e3a5f", padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 },
  tabs: { display: "flex", padding: "0 24px", background: "#0a0f1e", borderBottom: "1px solid #1e293b", gap: 2, overflowX: "auto" },
  tab: a => ({ padding: "10px 16px", fontSize: 13, fontWeight: a ? 700 : 400, color: a ? "#38bdf8" : "#64748b", background: "none", border: "none", borderBottom: `2px solid ${a ? "#38bdf8" : "transparent"}`, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", whiteSpace: "nowrap" }),
  body: { padding: "20px 24px" },
  card: { background: "#111827", borderRadius: 12, padding: "16px 20px", border: "1px solid #1e293b", marginBottom: 16 },
  cardT: { fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 },
  chart: { background: "#111827", borderRadius: 12, padding: "16px 20px", border: "1px solid #1e293b", marginBottom: 16 },
  chartT: { fontSize: 14, fontWeight: 700, color: "#f8fafc", marginBottom: 12 },
  skuCard: color => ({ background: "#111827", borderRadius: 12, padding: "14px 16px", border: "1px solid #1e293b", borderLeft: `3px solid ${color}` }),
  skuBtn: (a, c) => ({ padding: "5px 14px", borderRadius: 20, border: `1px solid ${a ? c : "#1e293b"}`, background: a ? c + "22" : "transparent", color: a ? c : "#64748b", fontSize: 12, fontWeight: a ? 700 : 400, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }),
  inp: { background: "#0a0f1e", border: "1px solid #334155", borderRadius: 8, padding: "8px 12px", color: "#f8fafc", fontSize: 14, width: "100%", boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif" },
  btn: { background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8, padding: "10px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" },
  g4: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 },
  g2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 },
  badge: show => ({ fontSize: 11, color: "#22c55e", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 20, padding: "3px 12px", display: show ? "inline-block" : "none" }),
};

const ChartTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, padding: "10px 14px", fontSize: 12 }}>
      {payload.map(p => p.value !== null && (
        <div key={p.dataKey} style={{ color: p.color, marginBottom: 2 }}>
          {SKUs.find(s => s.key === p.dataKey)?.label || p.name}: <b>{(p.value || 0).toLocaleString()}</b>
        </div>
      ))}
    </div>
  );
};

const chartOpts = ({ legend = true, stacked = false, minimal = false } = {}) => ({
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: "#94a3b8", boxWidth: 12 } },
    tooltip: { backgroundColor: "#1e293b", borderColor: "#334155", borderWidth: 1 }
  }
});

// ── Main App ──────────────────────────────────────────────────
export default function App() {
  const [salesData, setSalesData] = useState({});
  const [tab, setTab] = useState("overview");
  const [selectedSku, setSelectedSku] = useState("12mg_120");
  const [inputDate, setInputDate] = useState(new Date().toISOString().slice(0, 10));
  const [inputValues, setInputValues] = useState({ "12mg_45": "", "12mg_60": "", "12mg_90": "", "12mg_120": "" });
  const [saveStatus, setSaveStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState(null);

  // ── Load all data from Supabase ───────────────────────────
  const loadData = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("sales")
        .select("sku, date, sales")
        .order("date", { ascending: true })
        .limit(5000);

      if (error) throw error;

      const grouped = {};
      SKUs.forEach(({ key }) => { grouped[key] = []; });
      (data || []).forEach(row => {
        if (grouped[row.sku]) grouped[row.sku].push({ date: row.date, sales: row.sales });
      });
      setSalesData(grouped);
      setLastSync(new Date());
    } catch (e) {
      console.error("Load error:", e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    // Real-time subscription — updates instantly when anyone saves
    const channel = supabase
      .channel("sales-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "sales" }, () => {
        loadData();
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [loadData]);

  // ── Save data + auto-cleanup (keep last 365 days per SKU) ────
  const handleSave = useCallback(async () => {
    const rows = [];
    SKUs.forEach(({ key }) => {
      const val = parseInt(inputValues[key]);
      if (!isNaN(val) && val >= 0) {
        rows.push({ sku: key, date: inputDate, sales: val });
      }
    });
    if (!rows.length) { setSaveStatus("Please enter at least one value"); setTimeout(() => setSaveStatus(""), 3000); return; }

    try {
      const { error } = await supabase
        .from("sales")
        .upsert(rows, { onConflict: "sku,date" });
      if (error) throw error;

      // Auto-delete records older than 365 days to stay within free tier limits
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 365);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      await supabase.from("sales").delete().lt("date", cutoffStr);

      setSaveStatus("✓ Saved — all viewers updated instantly");
      setInputValues({ "12mg_45": "", "12mg_60": "", "12mg_90": "", "12mg_120": "" });
    } catch (e) {
      setSaveStatus("Error: " + e.message);
    }
    setTimeout(() => setSaveStatus(""), 4000);
  }, [inputDate, inputValues]);

  // ── Computed data ─────────────────────────────────────────
  const combinedDaily = useMemo(() => {
    const allDates = new Set();
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 60);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    SKUs.forEach(({ key }) => (salesData[key] || []).forEach(r => { if (r.date >= cutoffStr) allDates.add(r.date); }));
    const lookups = {}; SKUs.forEach(({ key }) => { lookups[key] = buildLookup(salesData[key]); });
    return [...allDates].sort().map(date => {
      const row = { date, label: date.slice(5) };
      let totalGMV = 0;
      SKUs.forEach(({ key, asp }) => {
        const units = lookups[key][date] ?? null;
        row[key] = units;
        if (units != null) totalGMV += units * asp;
      });
      row.gmv = totalGMV > 0 ? Math.round(totalGMV) : null;
      return row;
    });
  }, [salesData]);

  const combinedMonthly = useMemo(() => {
    const allMonths = new Set();
    SKUs.forEach(({ key }) => (salesData[key] || []).forEach(r => allMonths.add(r.date.slice(0, 7))));
    const lookups = {}; SKUs.forEach(({ key }) => { lookups[key] = getMonthlyMap(salesData[key]); });
    return [...allMonths].sort().map(month => {
      const row = { month, label: month.replace("-", "/") };
      SKUs.forEach(({ key }) => { row[key] = lookups[key][month] || 0; });
      return row;
    });
  }, [salesData]);

  const baselines = useMemo(() => {
    const r = {}; SKUs.forEach(({ key }) => { r[key] = { daily: getDailyBaseline(salesData[key]), monthly: getMonthBaseline(salesData[key]) }; });
    return r;
  }, [salesData]);

  const yesterday = useMemo(() => {
    const yDate = new Date(); yDate.setDate(yDate.getDate() - 1);
    const yStr = yDate.toISOString().slice(0, 10);
    const tStr = new Date().toISOString().slice(0, 10);
    const result = {}; SKUs.forEach(({ key }) => { const lk = buildLookup(salesData[key]); result[key] = { y: lk[yStr] ?? null, t: lk[tStr] ?? null }; });
    return { yDate: yStr, tDate: tStr, result };
  }, [salesData]);

  if (loading) return <div style={{ ...s.root, display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "#64748b" }}>Loading...</div>;

  const tabDefs = [["overview", "📊 Overview"], ["daily", "📈 Daily Trend"], ["monthly", "📅 Monthly"], ["baseline", "🎯 Baseline"], ["input", "✏️ Enter Data"]];

  return (
    <div style={s.root}>
      {/* HEADER */}
      <div style={s.hdr}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#f8fafc" }}>🦐 Astaxanthin 12mg Sales Dashboard</div>
          <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>45ct · 60ct · 90ct · 120ct | Live sync via Supabase</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={s.badge(!!lastSync)}>⟳ Synced {lastSync?.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</div>
          <div style={{ fontSize: 10, color: "#334155", marginTop: 3 }}>Real-time · auto-updates instantly</div>
        </div>
      </div>

      {/* TABS */}
      <div style={s.tabs}>
        {tabDefs.map(([k, l]) => <button key={k} style={s.tab(tab === k)} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      <div style={s.body}>

        {/* OVERVIEW */}
        {tab === "overview" && <>
          <div style={{ ...s.card, background: "linear-gradient(135deg,#111827,#0d1929)" }}>
            <div style={s.cardT}>Yesterday ({yesterday.yDate}) / Today ({yesterday.tDate})</div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
              {SKUs.map(({ key, label, color, asp }) => {
                const { y, t } = yesterday.result[key];
                const diff = y != null && t != null ? t - y : null;
                const yGMV = y != null ? (y * asp) : null;
                const tGMV = t != null ? (t * asp) : null;
                return (
                  <div key={key} style={{ background: "#0a0f1e", borderRadius: 10, padding: "12px 16px", flex: 1, minWidth: 120, border: `1px solid ${color}33` }}>
                    <div style={{ fontSize: 12, color, fontWeight: 700, marginBottom: 6 }}>{label}</div>
                    <div style={{ display: "flex", gap: 16 }}>
                      <div>
                        <div style={{ fontSize: 10, color: "#64748b" }}>Yesterday Units</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: "#f8fafc" }}>{y != null ? fmt(y) : <span style={{ color: "#334155" }}>—</span>}</div>
                        {yGMV != null && <div style={{ fontSize: 11, color: "#64748b" }}>${yGMV.toLocaleString("en-US", {maximumFractionDigits:0})} GMV</div>}
                      </div>
                      {t != null && <div>
                        <div style={{ fontSize: 10, color: "#64748b" }}>Today Units</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: diff >= 0 ? "#22c55e" : "#ef4444" }}>{fmt(t)}</div>
                        {tGMV != null && <div style={{ fontSize: 11, color: diff >= 0 ? "#22c55e" : "#ef4444" }}>${tGMV.toLocaleString("en-US", {maximumFractionDigits:0})} GMV</div>}
                        <div style={{ fontSize: 11, color: diff >= 0 ? "#22c55e" : "#ef4444" }}>{diff >= 0 ? `▲${diff}` : `▼${Math.abs(diff)}`} units</div>
                      </div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={s.g4}>
            {SKUs.map(({ key, label, color, asp }) => {
              const data = salesData[key] || [];
              const total = data.reduce((s, r) => s + r.sales, 0);
              const gmv = total * asp;
              const firstDate = data.length ? data[0].date.slice(0, 7) : null;
              const lastDate = data.length ? data[data.length - 1].date.slice(0, 7) : null;
              const dateRange = firstDate ? `${firstDate} ~ ${lastDate}` : '';
              return (
                <div key={key} style={s.skuCard(color)}>
                  <div style={{ fontSize: 11, color, fontWeight: 700, marginBottom: 6 }}>{label}</div>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 10, color: "#64748b" }}>Units</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: "#f8fafc" }}>{fmt(total)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "#64748b" }}>GMV</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color }}>{"$" + (gmv >= 1000000 ? (gmv/1000000).toFixed(1)+"M" : gmv >= 1000 ? (gmv/1000).toFixed(1)+"K" : gmv.toFixed(0))}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "#64748b" }}>ASP</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: "#94a3b8" }}>{"$"+asp.toFixed(2)}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: "#475569", marginTop: 6 }}>{dateRange}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>Daily avg <b style={{ color }}>{baselines[key].daily}</b> units · <b style={{ color }}>${(baselines[key].daily * asp).toFixed(0)}</b>/day GMV</div>
                </div>
              );
            })}
          </div>

          <div style={s.chart}>
            <div style={s.chartT}>Last 60 Days — Daily Sales Trend</div>
            <ResponsiveContainer width="100%" height={230}>
              <LineChart data={combinedDaily} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
                <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} interval={7} />
                <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Legend formatter={v => SKUs.find(s => s.key === v)?.label} />
                {SKUs.map(({ key, color }) => <Line key={key} type="monotone" dataKey={key} stroke={color} dot={false} strokeWidth={2} connectNulls />)}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={s.chart}>
            <div style={s.chartT}>Last 60 Days — Daily GMV (All SKUs Combined)</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={combinedDaily} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
                <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} interval={7} />
                <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false}
                  tickFormatter={v => v >= 1000 ? `$${(v/1000).toFixed(0)}K` : `$${v}`} />
                <Tooltip
                  formatter={v => [`$${v?.toLocaleString()}`, "GMV"]}
                  contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
                />
                <Bar dataKey="gmv" fill="#38bdf8" radius={[2, 2, 0, 0]} opacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>}

        {/* DAILY */}
        {tab === "daily" && <>
          <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
            {SKUs.map(({ key, label, color }) => <button key={key} style={s.skuBtn(selectedSku === key, color)} onClick={() => setSelectedSku(key)}>{label}</button>)}
          </div>
          {SKUs.filter(sk => sk.key === selectedSku).map(({ key, color, label }) => {
            const data = (salesData[key] || []).slice(-90);
            const last10 = [...(salesData[key] || [])].slice(-10).reverse();
            return (
              <div key={key}>
                <div style={s.chart}>
                  <div style={s.chartT}>{label} — Last 90 Days</div>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
                      <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 9 }} tickLine={false} interval={6} tickFormatter={fmtDate} />
                      <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} />
                      <Tooltip formatter={v => [v?.toLocaleString(), "Sales"]} contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }} />
                      <Bar dataKey="sales" fill={color} radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div style={s.card}>
                  <div style={s.cardT}>Last 10 Days</div>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr>{["Date", "Sales", "Change"].map(h => <th key={h} style={{ textAlign: h === "Date" ? "left" : "right", fontSize: 12, color: "#64748b", padding: "6px 0", borderBottom: "1px solid #1e293b" }}>{h}</th>)}</tr></thead>
                    <tbody>
                      {last10.map((r, i, arr) => {
                        const diff = arr[i + 1] ? r.sales - arr[i + 1].sales : null;
                        return (
                          <tr key={r.date}>
                            <td style={{ fontSize: 13, color: "#e2e8f0", padding: "6px 0", borderBottom: "1px solid #0a0f1e" }}>{r.date}</td>
                            <td style={{ textAlign: "right", fontSize: 14, fontWeight: 700, color: "#f8fafc", padding: "6px 0", borderBottom: "1px solid #0a0f1e" }}>{fmt(r.sales)}</td>
                            <td style={{ textAlign: "right", fontSize: 12, color: diff == null ? "#64748b" : diff >= 0 ? "#22c55e" : "#ef4444", padding: "6px 0", borderBottom: "1px solid #0a0f1e" }}>
                              {diff == null ? "—" : diff >= 0 ? `▲${diff}` : `▼${Math.abs(diff)}`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </>}

        {/* MONTHLY */}
        {tab === "monthly" && <>
          <div style={s.chart}>
            <div style={s.chartT}>Monthly Sales by SKU (Stacked)</div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={combinedMonthly} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
                <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} />
                <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Legend formatter={v => SKUs.find(s => s.key === v)?.label} />
                {SKUs.map(({ key, color }) => <Bar key={key} dataKey={key} stackId="a" fill={color} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={s.card}>
            <div style={s.cardT}>Monthly Breakdown</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", fontSize: 12, color: "#64748b", padding: "7px 8px", borderBottom: "1px solid #1e293b" }}>Month</th>
                    {SKUs.map(sk => <th key={sk.key} style={{ textAlign: "right", fontSize: 12, color: sk.color, padding: "7px 8px", borderBottom: "1px solid #1e293b" }}>{sk.label}</th>)}
                    <th style={{ textAlign: "right", fontSize: 12, color: "#94a3b8", padding: "7px 8px", borderBottom: "1px solid #1e293b" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {combinedMonthly.slice().reverse().map(row => {
                    const total = SKUs.reduce((s, { key }) => s + (row[key] || 0), 0);
                    return (
                      <tr key={row.month}>
                        <td style={{ fontSize: 13, color: "#e2e8f0", padding: "7px 8px", borderBottom: "1px solid #0a0f1e" }}>{row.label}</td>
                        {SKUs.map(sk => <td key={sk.key} style={{ textAlign: "right", fontSize: 13, color: "#f8fafc", padding: "7px 8px", borderBottom: "1px solid #0a0f1e" }}>{row[sk.key] ? fmt(row[sk.key]) : "—"}</td>)}
                        <td style={{ textAlign: "right", fontSize: 13, fontWeight: 700, color: "#38bdf8", padding: "7px 8px", borderBottom: "1px solid #0a0f1e" }}>{fmt(total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>}

        {/* BASELINE */}
        {tab === "baseline" && <>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 14 }}>Daily Baseline = last 30-day avg &nbsp;|&nbsp; Monthly Baseline = completed months avg</div>
          <div style={s.g2}>
            {SKUs.map(({ key, label, color }) => {
              const { daily, monthly } = baselines[key];
              const total = (salesData[key] || []).reduce((s, r) => s + r.sales, 0);
              return (
                <div key={key} style={s.skuCard(color)}>
                  <div style={{ fontSize: 13, fontWeight: 700, color, marginBottom: 12 }}>{label}</div>
                  <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                    {[["Daily Baseline", daily, "units/day"], ["Monthly Baseline", fmt(monthly), "units/mo"], ["Total", fmt(total), "units"]].map(([l, v, u]) => (
                      <div key={l}>
                        <div style={{ fontSize: 11, color: "#64748b" }}>{l}</div>
                        <div style={{ fontSize: 26, fontWeight: 800, color: "#f8fafc" }}>{v}</div>
                        <div style={{ fontSize: 11, color: "#64748b" }}>{u}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={s.chart}>
            <div style={s.chartT}>Last 30 Days by SKU</div>
            {SKUs.map(({ key, label, color }) => {
              const data = (salesData[key] || []).slice(-30);
              return (
                <div key={key} style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 12, color, fontWeight: 700, marginBottom: 4 }}>{label} · Daily Baseline: <b>{baselines[key].daily}</b></div>
                  <ResponsiveContainer width="100%" height={90}>
                    <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                      <YAxis hide />
                      <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 8 }} tickLine={false} interval={4} tickFormatter={fmtDate} />
                      <Tooltip formatter={v => [v, "Sales"]} contentStyle={{ background: "#0a0f1e", border: "1px solid #334155", borderRadius: 6 }} />
                      <Bar dataKey="sales" fill={color + "99"} radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              );
            })}
          </div>
        </>}

        {/* INPUT */}
        {tab === "input" && <>
          <div style={{ ...s.card, background: "rgba(56,189,248,0.05)", border: "1px solid rgba(56,189,248,0.2)", marginBottom: 12 }}>
            <div style={{ fontSize: 13, color: "#38bdf8" }}>💡 Data saved here instantly syncs to everyone viewing the dashboard — no refresh needed.</div>
          </div>
          <div style={s.card}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#f8fafc", marginBottom: 14 }}>Add Daily Sales</div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6 }}>Date</label>
              <input type="date" value={inputDate} onChange={e => setInputDate(e.target.value)} style={{ ...s.inp, width: "auto" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              {SKUs.map(({ key, label, color }) => (
                <div key={key}>
                  <label style={{ fontSize: 12, color, fontWeight: 700, display: "block", marginBottom: 6 }}>{label}</label>
                  <input type="number" min="0" placeholder="Enter sales..." value={inputValues[key]}
                    onChange={e => setInputValues(v => ({ ...v, [key]: e.target.value }))} style={s.inp} />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button style={s.btn} onClick={handleSave}>Save & Sync</button>
              {saveStatus && <div style={{ fontSize: 13, color: saveStatus.startsWith("✓") ? "#22c55e" : "#ef4444" }}>{saveStatus}</div>}
            </div>
          </div>

          <div style={s.card}>
            <div style={s.cardT}>Recent Entries</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 400 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", fontSize: 12, color: "#64748b", padding: "6px 8px", borderBottom: "1px solid #1e293b" }}>Date</th>
                    {SKUs.map(sk => <th key={sk.key} style={{ textAlign: "right", fontSize: 12, color: sk.color, padding: "6px 8px", borderBottom: "1px solid #1e293b" }}>{sk.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const allDates = new Set();
                    SKUs.forEach(({ key }) => (salesData[key] || []).slice(-5).forEach(r => allDates.add(r.date)));
                    const lks = {}; SKUs.forEach(({ key }) => { lks[key] = buildLookup(salesData[key]); });
                    return [...allDates].sort().reverse().map(date => (
                      <tr key={date}>
                        <td style={{ fontSize: 13, color: "#e2e8f0", padding: "7px 8px", borderBottom: "1px solid #0a0f1e" }}>{date}</td>
                        {SKUs.map(sk => <td key={sk.key} style={{ textAlign: "right", fontSize: 13, color: lks[sk.key][date] !== undefined ? "#f8fafc" : "#334155", padding: "7px 8px", borderBottom: "1px solid #0a0f1e" }}>{lks[sk.key][date] ?? "—"}</td>)}
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </>}

      </div>
    </div>
  );
}
