import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Home, Package, BookOpen, ShoppingCart, Users, Plus, X, Check,
  Trash2, Pencil, Phone, ScanLine, Search, ArrowLeft, TrendingUp,
  AlertTriangle, Wallet, ChevronRight, Camera, RotateCcw
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const STORAGE_KEY = "mustafas-shop-data-v1";

// Standalone deployment storage: saves to this browser/device's localStorage.
// (Each device keeps its own copy — see the delivery notes for adding shared/cloud sync.)
const storage = {
  async get(key) {
    const raw = window.localStorage.getItem(key);
    return raw ? { value: raw } : null;
  },
  async set(key, value) {
    window.localStorage.setItem(key, value);
    return { key, value };
  },
};

const emptyData = () => ({
  items: [],
  sales: [],
  customers: [],
  settings: {
    partner1: "Partner 1",
    partner2: "Partner 2",
    withdrawals: [], // {id, partner: 1|2, amount, date, note}
  },
});

function uid() {
  try { return crypto.randomUUID(); } catch (e) { return "id-" + Date.now() + "-" + Math.random().toString(16).slice(2); }
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function fmtMoney(n) {
  const v = Math.round(Number(n) || 0);
  return "Rs " + v.toLocaleString("en-PK");
}

function fmtDate(d) {
  const dt = new Date(d);
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/* ---------------- Ledger-style primitives ---------------- */

function LedgerRow({ children, onClick, className = "" }) {
  return (
    <div
      onClick={onClick}
      className={`ledger-row ${onClick ? "clickable" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children }) {
  return <div className="section-label">{children}</div>;
}

function Stat({ label, value, tone = "ink" }) {
  return (
    <div className="stat">
      <div className="stat-value" style={{ color: `var(--${tone})` }}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal-sheet ${wide ? "wide" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>{title}</span>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

/* ---------------- Barcode scanner ---------------- */

function ScannerModal({ onClose, onDetect }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [supported, setSupported] = useState(true);
  const [error, setError] = useState("");
  const [manual, setManual] = useState("");

  useEffect(() => {
    let raf;
    let detector;
    let cancelled = false;

    async function start() {
      if (!("BarcodeDetector" in window)) {
        setSupported(false);
        return;
      }
      try {
        detector = new window.BarcodeDetector({
          formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"],
        });
      } catch (e) {
        setSupported(false);
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const tick = async () => {
          if (cancelled) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes && codes.length > 0) {
              onDetect(codes[0].rawValue);
              return;
            }
          } catch (e) { /* keep trying */ }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch (e) {
        setError("Camera access was blocked or unavailable.");
      }
    }
    start();
    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, [onDetect]);

  return (
    <Modal title="Scan barcode" onClose={onClose}>
      {supported && !error ? (
        <div className="scanner-wrap">
          <video ref={videoRef} muted playsInline className="scanner-video" />
          <div className="scanner-reticle" />
          <div className="hint-text">Point the camera at the barcode</div>
        </div>
      ) : (
        <div className="hint-text" style={{ marginBottom: 10 }}>
          <AlertTriangle size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
          {error || "Camera scanning isn't supported on this browser."} Enter the code below instead.
        </div>
      )}
      <div className="field" style={{ marginTop: 12 }}>
        <span>Enter barcode manually</span>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="e.g. 8964000123456" />
          <button className="btn-solid" onClick={() => manual.trim() && onDetect(manual.trim())}>Use</button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- Photo identify (on-device, best-effort) ---------------- */

function PhotoIdentifyModal({ onClose, onIdentified }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const modelRef = useRef(null);
  const [status, setStatus] = useState("starting"); // starting | ready | classifying | error
  const [error, setError] = useState("");
  const [predictions, setPredictions] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStatus("ready");
      } catch (e) {
        setError("Camera access was blocked or unavailable.");
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function capture() {
    setStatus("classifying");
    setPredictions(null);
    setError("");
    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth || 320;
      canvas.height = video.videoHeight || 240;
      canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);

      if (!modelRef.current) {
        const mobilenet = await import("@tensorflow-models/mobilenet");
        await import("@tensorflow/tfjs");
        modelRef.current = await mobilenet.load();
      }
      const preds = await modelRef.current.classify(canvas);
      setPredictions(preds);
      setStatus("ready");
    } catch (e) {
      setError("Couldn't run recognition on this device/browser.");
      setStatus("error");
    }
  }

  function useLabel(label) {
    const clean = label.split(",")[0].replace(/_/g, " ").trim();
    const titled = clean.charAt(0).toUpperCase() + clean.slice(1);
    onIdentified(titled);
  }

  return (
    <Modal title="Identify from photo" onClose={onClose}>
      {status !== "error" ? (
        <div className="scanner-wrap">
          <video ref={videoRef} muted playsInline className="scanner-video" />
        </div>
      ) : (
        <div className="hint-text"><AlertTriangle size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />{error}</div>
      )}
      <canvas ref={canvasRef} style={{ display: "none" }} />

      <button className="btn-solid full" disabled={status !== "ready" && status !== "error"} onClick={capture}>
        {status === "classifying" ? "Thinking…" : "Capture & identify"}
      </button>

      {predictions && (
        <div className="ledger-list">
          {predictions.map((p, idx) => (
            <LedgerRow key={idx} onClick={() => useLabel(p.className)}>
              <div className="row-main">
                <div className="row-title">{p.className.split(",")[0]}</div>
                <div className="row-sub">{Math.round(p.probability * 100)}% match · tap to use</div>
              </div>
            </LedgerRow>
          ))}
        </div>
      )}

      <div className="hint-text">
        This is a rough on-device guess, not a brand-specific lookup — always check the name before saving. First use downloads a small recognition model, so it needs internet the first time.
      </div>
    </Modal>
  );
}

async function lookupBarcode(code) {
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json`);
    const json = await res.json();
    if (json && json.status === 1 && json.product) {
      const p = json.product;
      return { name: p.product_name || p.generic_name || "", brand: p.brands || "" };
    }
  } catch (e) { /* offline or blocked, ignore */ }
  return null;
}

/* ---------------- App ---------------- */

export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("dashboard");
  const [toast, setToast] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await storage.get(STORAGE_KEY);
        if (res && res.value) {
          const parsed = JSON.parse(res.value);
          setData({ ...emptyData(), ...parsed, settings: { ...emptyData().settings, ...(parsed.settings || {}) } });
        } else {
          setData(emptyData());
        }
      } catch (e) {
        setData(emptyData());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const persist = useCallback(async (next) => {
    setData(next);
    try {
      await storage.set(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      showToast("Could not save — check connection");
    }
  }, []);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 2200);
  }

  if (loading || !data) {
    return (
      <div className="shop-app">
        <ShopStyles />
        <div className="loading-screen">Opening the register…</div>
      </div>
    );
  }

  return (
    <div className="shop-app">
      <ShopStyles />
      <Header data={data} />
      <main className="content">
        {tab === "dashboard" && <Dashboard data={data} setTab={setTab} />}
        {tab === "inventory" && <Inventory data={data} persist={persist} showToast={showToast} />}
        {tab === "khata" && <Khata data={data} persist={persist} showToast={showToast} />}
        {tab === "sales" && <Sales data={data} persist={persist} showToast={showToast} />}
        {tab === "partners" && <Partners data={data} persist={persist} showToast={showToast} />}
      </main>
      <nav className="tabbar">
        <TabBtn icon={Home} label="Dashboard" active={tab === "dashboard"} onClick={() => setTab("dashboard")} />
        <TabBtn icon={Package} label="Stock" active={tab === "inventory"} onClick={() => setTab("inventory")} />
        <TabBtn icon={BookOpen} label="Khata" active={tab === "khata"} onClick={() => setTab("khata")} />
        <TabBtn icon={ShoppingCart} label="Sales" active={tab === "sales"} onClick={() => setTab("sales")} />
        <TabBtn icon={Users} label="Partners" active={tab === "partners"} onClick={() => setTab("partners")} />
      </nav>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function TabBtn({ icon: Icon, label, active, onClick }) {
  return (
    <button className={`tab-btn ${active ? "active" : ""}`} onClick={onClick}>
      <Icon size={20} strokeWidth={active ? 2.4 : 1.8} />
      <span>{label}</span>
    </button>
  );
}

function Header({ data }) {
  const today = data.sales.filter((s) => s.date === todayStr());
  const todayProfit = today.reduce((a, s) => a + s.profit, 0);
  return (
    <header className="app-header">
      <div className="header-stamp">
        <div className="stamp-ring">MS</div>
        <div>
          <h1>Mustafa&apos;s Shop</h1>
          <div className="header-sub">Stationery, Snacks &amp; More — Ledger</div>
        </div>
      </div>
      <div className="header-today">
        <div className="header-today-label">Today&apos;s profit</div>
        <div className="header-today-value">{fmtMoney(todayProfit)}</div>
      </div>
    </header>
  );
}

/* ---------------- Dashboard ---------------- */

function Dashboard({ data, setTab }) {
  const totalStockValue = data.items.reduce((a, i) => a + i.costPrice * i.stock, 0);
  const totalProfit = data.sales.reduce((a, s) => a + s.profit, 0);
  const totalOwed = data.customers.reduce((a, c) => a + Math.max(0, c.balance), 0);
  const lowStock = data.items.filter((i) => i.stock <= (i.lowStockAt ?? 5));
  const recentSales = [...data.sales].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 5);

  const chartData = useMemo(() => {
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const profit = data.sales.filter((s) => s.date === key).reduce((a, s) => a + s.profit, 0);
      days.push({ label: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }), profit });
    }
    return days;
  }, [data.sales]);

  return (
    <div className="pane">
      <div className="stat-row">
        <Stat label="Stock value (cost)" value={fmtMoney(totalStockValue)} />
        <Stat label="Total profit" value={fmtMoney(totalProfit)} tone="green" />
        <Stat label="Udhaar owed" value={fmtMoney(totalOwed)} tone="rust" />
      </div>

      <SectionLabel>Profit, last 14 days</SectionLabel>
      <div className="chart-card">
        {totalProfit === 0 ? (
          <div className="empty-hint">Profit history will appear here once you log a sale.</div>
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="var(--rule-faint)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--ink-soft)" }} interval={2} axisLine={{ stroke: "var(--rule-faint)" }} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "var(--ink-soft)" }} axisLine={false} tickLine={false} width={40} />
              <Tooltip
                formatter={(v) => fmtMoney(v)}
                contentStyle={{ background: "var(--paper-light)", border: "1px solid var(--rule)", fontSize: 12, borderRadius: 4 }}
              />
              <Line type="monotone" dataKey="profit" stroke="var(--green)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {lowStock.length > 0 && (
        <>
          <SectionLabel>Running low</SectionLabel>
          <div className="ledger-list">
            {lowStock.map((i) => (
              <LedgerRow key={i.id}>
                <div className="row-main">
                  <div className="row-title">{i.name}</div>
                  <div className="row-sub">{i.category}</div>
                </div>
                <div className="row-amt rust">{i.stock} left</div>
              </LedgerRow>
            ))}
          </div>
        </>
      )}

      <SectionLabel>Recent sales</SectionLabel>
      <div className="ledger-list">
        {recentSales.length === 0 && <div className="empty-hint">No sales recorded yet — add one from the Sales tab.</div>}
        {recentSales.map((s) => (
          <LedgerRow key={s.id}>
            <div className="row-main">
              <div className="row-title">{s.itemName} × {s.qty}</div>
              <div className="row-sub">{fmtDate(s.date)}{s.credit ? " · on khata" : ""}</div>
            </div>
            <div className="row-amt green">+{fmtMoney(s.profit)}</div>
          </LedgerRow>
        ))}
      </div>

      <button className="btn-solid full" onClick={() => setTab("sales")}>
        <Plus size={16} /> Record a sale
      </button>
    </div>
  );
}

/* ---------------- Inventory ---------------- */

function Inventory({ data, persist, showToast }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [editing, setEditing] = useState(null); // item or "new"

  const filtered = data.items.filter((i) => {
    const matchesQ = i.name.toLowerCase().includes(query.toLowerCase()) || (i.barcode || "").includes(query);
    const matchesC = category === "All" || i.category === category;
    return matchesQ && matchesC;
  });

  function saveItem(item) {
    const items = [...data.items];
    const idx = items.findIndex((i) => i.id === item.id);
    if (idx >= 0) items[idx] = item; else items.push(item);
    persist({ ...data, items });
    setEditing(null);
    showToast(idx >= 0 ? "Item updated" : "Item added to stock");
  }

  function deleteItem(id) {
    persist({ ...data, items: data.items.filter((i) => i.id !== id) });
    setEditing(null);
    showToast("Item removed");
  }

  return (
    <div className="pane">
      <div className="search-row">
        <div className="search-box">
          <Search size={15} />
          <input placeholder="Search stock or barcode" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <button className="btn-solid" onClick={() => setEditing("new")}><Plus size={16} /> Add</button>
      </div>

      <div className="chip-row">
        {["All", "Stationery", "Snacks", "Cold Drinks"].map((c) => (
          <button key={c} className={`chip ${category === c ? "active" : ""}`} onClick={() => setCategory(c)}>{c}</button>
        ))}
      </div>

      <div className="ledger-list">
        {filtered.length === 0 && <div className="empty-hint">No items here yet. Tap Add to bring in new goods.</div>}
        {filtered.map((i) => (
          <LedgerRow key={i.id} onClick={() => setEditing(i)}>
            <div className="row-main">
              <div className="row-title">{i.name}</div>
              <div className="row-sub">
                {i.category} · margin {fmtMoney(i.sellPrice - i.costPrice)}
                {i.hasBox ? ` · box of ${i.piecesPerBox} @ ${fmtMoney(i.boxSellPrice)}` : ""}
              </div>
            </div>
            <div className="row-end">
              <div className="row-amt">{fmtMoney(i.sellPrice)}</div>
              <div className={`row-sub ${i.stock <= (i.lowStockAt ?? 5) ? "rust" : ""}`}>
                {i.stock} pcs{i.hasBox ? ` (~${Math.floor(i.stock / i.piecesPerBox)} box)` : ""}
              </div>
            </div>
          </LedgerRow>
        ))}
      </div>

      {editing && (
        <ItemModal
          item={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={saveItem}
          onDelete={deleteItem}
        />
      )}
    </div>
  );
}

function ItemModal({ item, onClose, onSave, onDelete }) {
  const [name, setName] = useState(item?.name || "");
  const [category, setCategory] = useState(item?.category || "Stationery");
  const [barcode, setBarcode] = useState(item?.barcode || "");
  const [costPrice, setCostPrice] = useState(item?.costPrice ?? "");
  const [sellPrice, setSellPrice] = useState(item?.sellPrice ?? "");
  const [stock, setStock] = useState(item?.stock ?? "");
  const [lowStockAt, setLowStockAt] = useState(item?.lowStockAt ?? 5);
  const [hasBox, setHasBox] = useState(item?.hasBox ?? false);
  const [piecesPerBox, setPiecesPerBox] = useState(item?.piecesPerBox ?? "");
  const [boxSellPrice, setBoxSellPrice] = useState(item?.boxSellPrice ?? "");
  const [scanning, setScanning] = useState(false);
  const [identifying, setIdentifying] = useState(false);
  const [looking, setLooking] = useState(false);
  const [restockQty, setRestockQty] = useState("");
  const [restockUnit, setRestockUnit] = useState("piece");

  async function handleDetected(code) {
    setBarcode(code);
    setScanning(false);
    setLooking(true);
    const found = await lookupBarcode(code);
    setLooking(false);
    if (found?.name && !name) setName(found.brand ? `${found.name} (${found.brand})` : found.name);
  }

  function handleIdentified(label) {
    setIdentifying(false);
    setName(label);
  }

  function applyRestock() {
    const n = Number(restockQty);
    if (!n) return;
    const addPieces = restockUnit === "box" ? n * (Number(piecesPerBox) || 1) : n;
    setStock((Number(stock) || 0) + addPieces);
    setRestockQty("");
  }

  function submit() {
    if (!name.trim() || costPrice === "" || sellPrice === "" || stock === "") return;
    if (hasBox && (!piecesPerBox || !boxSellPrice)) return;
    onSave({
      id: item?.id || uid(),
      name: name.trim(),
      category,
      barcode: barcode.trim(),
      costPrice: Number(costPrice),
      sellPrice: Number(sellPrice),
      stock: Number(stock),
      lowStockAt: Number(lowStockAt) || 5,
      hasBox,
      piecesPerBox: hasBox ? Number(piecesPerBox) : null,
      boxSellPrice: hasBox ? Number(boxSellPrice) : null,
    });
  }

  return (
    <Modal title={item ? "Edit item" : "New goods"} onClose={onClose}>
      <Field label="Item name">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dolphin notebook 100pg" />
      </Field>

      <Field label="Category">
        <div className="chip-row">
          {["Stationery", "Snacks", "Cold Drinks"].map((c) => (
            <button key={c} type="button" className={`chip ${category === c ? "active" : ""}`} onClick={() => setCategory(c)}>{c}</button>
          ))}
        </div>
      </Field>

      <Field label="Barcode">
        <div style={{ display: "flex", gap: 8 }}>
          <input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Scan or type code" />
          <button type="button" className="btn-outline" onClick={() => setScanning(true)}><ScanLine size={16} /></button>
          <button type="button" className="btn-outline" onClick={() => setIdentifying(true)} title="Identify from photo"><Camera size={16} /></button>
        </div>
        {looking && <div className="hint-text">Looking up product…</div>}
      </Field>

      <div className="field-grid">
        <Field label="Cost price (per piece)">
          <input type="number" inputMode="decimal" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} placeholder="0" />
        </Field>
        <Field label="Selling price (per piece)">
          <input type="number" inputMode="decimal" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} placeholder="0" />
        </Field>
      </div>
      <div className="field-grid">
        <Field label="Stock quantity (pieces)">
          <input type="number" inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="0" />
        </Field>
        <Field label="Low stock alert at">
          <input type="number" inputMode="numeric" value={lowStockAt} onChange={(e) => setLowStockAt(e.target.value)} />
        </Field>
      </div>

      {costPrice !== "" && sellPrice !== "" && (
        <div className="hint-text">Margin per piece: {fmtMoney(Number(sellPrice || 0) - Number(costPrice || 0))}</div>
      )}

      <div className="restock-box">
        <span className="restock-label">Goods just arrived? Add to stock</span>
        <div style={{ display: "flex", gap: 8 }}>
          <input type="number" inputMode="numeric" placeholder="Qty" value={restockQty} onChange={(e) => setRestockQty(e.target.value)} style={{ flex: 1 }} />
          <select value={restockUnit} onChange={(e) => setRestockUnit(e.target.value)} style={{ flex: 1 }}>
            <option value="piece">Piece(s)</option>
            {hasBox && <option value="box">Box(es) of {piecesPerBox || "?"}</option>}
          </select>
          <button type="button" className="btn-outline" onClick={applyRestock}>Add</button>
        </div>
      </div>

      <label className="checkbox-row">
        <input type="checkbox" checked={hasBox} onChange={(e) => setHasBox(e.target.checked)} />
        <span>Also sold by the box / carton (some people buy loose, some buy the whole box)</span>
      </label>

      {hasBox && (
        <>
          <div className="field-grid">
            <Field label="Pieces per box">
              <input type="number" inputMode="numeric" value={piecesPerBox} onChange={(e) => setPiecesPerBox(e.target.value)} placeholder="e.g. 24" />
            </Field>
            <Field label="Box selling price">
              <input type="number" inputMode="decimal" value={boxSellPrice} onChange={(e) => setBoxSellPrice(e.target.value)} placeholder="e.g. 550" />
            </Field>
          </div>
          {piecesPerBox !== "" && costPrice !== "" && boxSellPrice !== "" && (
            <div className="hint-text">
              Box cost: {fmtMoney(Number(piecesPerBox) * Number(costPrice))} · Box margin: {fmtMoney(Number(boxSellPrice) - Number(piecesPerBox) * Number(costPrice))}
            </div>
          )}
        </>
      )}

      <div className="modal-actions">
        {item && (
          <button className="btn-danger" onClick={() => onDelete(item.id)}><Trash2 size={16} /> Remove</button>
        )}
        <button className="btn-solid full" onClick={submit}><Check size={16} /> {item ? "Save changes" : "Add to stock"}</button>
      </div>

      {scanning && (
        <ScannerModal onClose={() => setScanning(false)} onDetect={handleDetected} />
      )}
      {identifying && (
        <PhotoIdentifyModal onClose={() => setIdentifying(false)} onIdentified={handleIdentified} />
      )}
    </Modal>
  );
}

/* ---------------- Khata (customer credit ledger) ---------------- */

function Khata({ data, persist, showToast }) {
  const [openCustomer, setOpenCustomer] = useState(null);
  const [adding, setAdding] = useState(false);

  const customers = [...data.customers].sort((a, b) => b.balance - a.balance);
  const totalOwed = customers.reduce((a, c) => a + Math.max(0, c.balance), 0);

  function addCustomer({ name, phone }) {
    const c = { id: uid(), name, phone, balance: 0, history: [] };
    persist({ ...data, customers: [...data.customers, c] });
    setAdding(false);
    showToast("Customer added to khata");
  }

  function updateCustomer(updated) {
    persist({ ...data, customers: data.customers.map((c) => (c.id === updated.id ? updated : c)) });
  }

  const active = openCustomer ? data.customers.find((c) => c.id === openCustomer.id) : null;

  if (active) {
    return (
      <CustomerDetail
        customer={active}
        onBack={() => setOpenCustomer(null)}
        onUpdate={updateCustomer}
        showToast={showToast}
      />
    );
  }

  return (
    <div className="pane">
      <div className="stat-row">
        <Stat label="Total owed to shop" value={fmtMoney(totalOwed)} tone="rust" />
        <Stat label="Customers" value={customers.length} />
      </div>

      <div className="search-row">
        <div className="section-label" style={{ flex: 1 }}>Udhaar khata</div>
        <button className="btn-solid" onClick={() => setAdding(true)}><Plus size={16} /> Customer</button>
      </div>

      <div className="ledger-list">
        {customers.length === 0 && <div className="empty-hint">No customers on the khata yet. Add someone who borrows on credit.</div>}
        {customers.map((c) => (
          <LedgerRow key={c.id} onClick={() => setOpenCustomer(c)}>
            <div className="row-main">
              <div className="row-title">{c.name}</div>
              <div className="row-sub">{c.phone || "no phone"}</div>
            </div>
            <div className="row-end">
              <div className={`row-amt ${c.balance > 0 ? "rust" : "green"}`}>{fmtMoney(c.balance)}</div>
              <ChevronRight size={16} color="var(--ink-soft)" />
            </div>
          </LedgerRow>
        ))}
      </div>

      {adding && (
        <Modal title="New customer" onClose={() => setAdding(false)}>
          <AddCustomerForm onAdd={addCustomer} />
        </Modal>
      )}
    </div>
  );
}

function AddCustomerForm({ onAdd }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  return (
    <div>
      <Field label="Customer name">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ahmed bhai" />
      </Field>
      <Field label="Phone (optional)">
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03xx-xxxxxxx" />
      </Field>
      <button className="btn-solid full" onClick={() => name.trim() && onAdd({ name: name.trim(), phone: phone.trim() })}>
        <Check size={16} /> Add customer
      </button>
    </div>
  );
}

function CustomerDetail({ customer, onBack, onUpdate, showToast }) {
  const [addingEntry, setAddingEntry] = useState(null); // "borrow" | "payment"

  function addEntry(kind, amount, note) {
    const amt = Number(amount);
    if (!amt) return;
    const entry = {
      id: uid(),
      kind, // borrow | payment
      amount: amt,
      note: note?.trim() || "",
      date: todayStr(),
    };
    const balance = customer.balance + (kind === "borrow" ? amt : -amt);
    onUpdate({ ...customer, balance, history: [entry, ...customer.history] });
    setAddingEntry(null);
    showToast(kind === "borrow" ? "Borrowed item recorded" : "Payment recorded");
  }

  return (
    <div className="pane">
      <button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Khata</button>

      <div className="customer-head">
        <div>
          <h2>{customer.name}</h2>
          {customer.phone && <div className="row-sub"><Phone size={12} style={{ verticalAlign: "-1px" }} /> {customer.phone}</div>}
        </div>
        <div className={`balance-badge ${customer.balance > 0 ? "rust" : "green"}`}>
          {fmtMoney(customer.balance)}
          <span>{customer.balance > 0 ? "owed" : "settled"}</span>
        </div>
      </div>

      <div className="two-btn-row">
        <button className="btn-outline full" onClick={() => setAddingEntry("borrow")}>+ Borrowed goods</button>
        <button className="btn-solid full" onClick={() => setAddingEntry("payment")}>Payment received</button>
      </div>

      <SectionLabel>History</SectionLabel>
      <div className="ledger-list">
        {customer.history.length === 0 && <div className="empty-hint">Nothing recorded yet.</div>}
        {customer.history.map((h) => (
          <LedgerRow key={h.id}>
            <div className="row-main">
              <div className="row-title">{h.kind === "borrow" ? "Borrowed" : "Paid"}{h.note ? ` — ${h.note}` : ""}</div>
              <div className="row-sub">{fmtDate(h.date)}</div>
            </div>
            <div className={`row-amt ${h.kind === "borrow" ? "rust" : "green"}`}>
              {h.kind === "borrow" ? "+" : "−"}{fmtMoney(h.amount)}
            </div>
          </LedgerRow>
        ))}
      </div>

      {addingEntry && (
        <Modal title={addingEntry === "borrow" ? "Record borrowed goods" : "Record payment"} onClose={() => setAddingEntry(null)}>
          <EntryForm kind={addingEntry} onSubmit={(amt, note) => addEntry(addingEntry, amt, note)} />
        </Modal>
      )}
    </div>
  );
}

function EntryForm({ kind, onSubmit }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  return (
    <div>
      <Field label="Amount">
        <input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
      </Field>
      <Field label={kind === "borrow" ? "What was taken (optional)" : "Note (optional)"}>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === "borrow" ? "e.g. 2 notebooks, chips" : "e.g. cash payment"} />
      </Field>
      <button className="btn-solid full" onClick={() => onSubmit(amount, note)}><Check size={16} /> Save entry</button>
    </div>
  );
}

/* ---------------- Sales ---------------- */

function Sales({ data, persist, showToast }) {
  const [recording, setRecording] = useState(false);
  const [servicing, setServicing] = useState(false);
  const sorted = [...data.sales].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const totalProfit = data.sales.reduce((a, s) => a + s.profit, 0);
  const totalRevenue = data.sales.reduce((a, s) => a + s.total, 0);

  function applyCredit(customers, customerId, total, note) {
    if (!customerId) return customers;
    return customers.map((c) =>
      c.id === customerId
        ? { ...c, balance: c.balance + total, history: [{ id: uid(), kind: "borrow", amount: total, note, date: todayStr() }, ...c.history] }
        : c
    );
  }

  function recordSale({ itemId, qty, unit, credit, customerId }) {
    const item = data.items.find((i) => i.id === itemId);
    if (!item || qty <= 0) return;

    const isBox = unit === "box";
    const unitSell = isBox ? item.boxSellPrice : item.sellPrice;
    const unitCost = isBox ? item.costPrice * item.piecesPerBox : item.costPrice;
    const piecesUsed = isBox ? qty * item.piecesPerBox : qty;
    const total = unitSell * qty;
    const profit = (unitSell - unitCost) * qty;

    const sale = {
      id: uid(),
      itemId,
      itemName: item.name + (isBox ? " (box)" : ""),
      qty,
      unit: isBox ? "box" : "piece",
      costPrice: unitCost,
      sellPrice: unitSell,
      total,
      profit,
      credit,
      customerId: credit ? customerId : null,
      date: todayStr(),
      createdAt: new Date().toISOString(),
    };

    const items = data.items.map((i) => (i.id === itemId ? { ...i, stock: Math.max(0, i.stock - piecesUsed) } : i));
    const customers = credit
      ? applyCredit(data.customers, customerId, total, `${item.name} × ${qty}${isBox ? " box" : ""}`)
      : data.customers;

    persist({ ...data, items, sales: [...data.sales, sale], customers });
    setRecording(false);
    showToast("Sale recorded");
  }

  function recordService({ description, amount, cost, credit, customerId }) {
    if (!description.trim() || !amount) return;
    const total = Number(amount);
    const profit = total - (Number(cost) || 0);
    const sale = {
      id: uid(),
      itemId: null,
      itemName: description.trim(),
      qty: 1,
      unit: "service",
      isService: true,
      costPrice: Number(cost) || 0,
      sellPrice: total,
      total,
      profit,
      credit,
      customerId: credit ? customerId : null,
      date: todayStr(),
      createdAt: new Date().toISOString(),
    };
    const customers = credit ? applyCredit(data.customers, customerId, total, description.trim()) : data.customers;
    persist({ ...data, sales: [...data.sales, sale], customers });
    setServicing(false);
    showToast("Service sale recorded");
  }

  return (
    <div className="pane">
      <div className="stat-row">
        <Stat label="Total revenue" value={fmtMoney(totalRevenue)} />
        <Stat label="Total profit" value={fmtMoney(totalProfit)} tone="green" />
      </div>

      <div className="two-btn-row">
        <button className="btn-solid full" onClick={() => setRecording(true)}><Plus size={16} /> Sell stock item</button>
        <button className="btn-outline full" onClick={() => setServicing(true)}><Plus size={16} /> Printing / service</button>
      </div>

      <SectionLabel>Sales history</SectionLabel>
      <div className="ledger-list">
        {sorted.length === 0 && <div className="empty-hint">No sales yet.</div>}
        {sorted.map((s) => (
          <LedgerRow key={s.id}>
            <div className="row-main">
              <div className="row-title">{s.itemName}{!s.isService ? ` × ${s.qty}` : ""}</div>
              <div className="row-sub">{fmtDate(s.date)} · {fmtMoney(s.total)}{s.credit ? " · on khata" : " · cash"}</div>
            </div>
            <div className="row-amt green">+{fmtMoney(s.profit)}</div>
          </LedgerRow>
        ))}
      </div>

      {recording && (
        <SaleModal data={data} onClose={() => setRecording(false)} onSubmit={recordSale} />
      )}
      {servicing && (
        <ServiceSaleModal data={data} onClose={() => setServicing(false)} onSubmit={recordService} />
      )}
    </div>
  );
}

function ServiceSaleModal({ data, onClose, onSubmit }) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [cost, setCost] = useState("");
  const [credit, setCredit] = useState(false);
  const [customerId, setCustomerId] = useState(data.customers[0]?.id || "");
  const profit = Number(amount || 0) - Number(cost || 0);

  return (
    <Modal title="Printing / other service" onClose={onClose}>
      <Field label="What was it">
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. 10 pages printing, photocopy" />
      </Field>
      <div className="field-grid">
        <Field label="Amount charged">
          <input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
        </Field>
        <Field label="Cost (paper/ink, optional)">
          <input type="number" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0" />
        </Field>
      </div>

      <label className="checkbox-row">
        <input type="checkbox" checked={credit} onChange={(e) => setCredit(e.target.checked)} />
        <span>On khata (credit) instead of cash</span>
      </label>
      {credit && (
        <Field label="Customer">
          {data.customers.length === 0 ? (
            <div className="hint-text">Add a customer in the Khata tab first.</div>
          ) : (
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              {data.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </Field>
      )}

      <div className="totals-box">
        <div><span>Profit</span><b className="green-text">{fmtMoney(profit)}</b></div>
      </div>

      <button
        className="btn-solid full"
        disabled={!description.trim() || !amount || (credit && !customerId)}
        onClick={() => onSubmit({ description, amount, cost, credit, customerId: credit ? customerId : null })}
      >
        <Check size={16} /> Confirm
      </button>
    </Modal>
  );
}

function SaleModal({ data, onClose, onSubmit }) {
  const [query, setQuery] = useState("");
  const [itemId, setItemId] = useState(data.items[0]?.id || "");
  const [unit, setUnit] = useState("piece");
  const [qty, setQty] = useState(1);
  const [credit, setCredit] = useState(false);
  const [customerId, setCustomerId] = useState(data.customers[0]?.id || "");

  const filteredItems = data.items.filter((i) => i.name.toLowerCase().includes(query.toLowerCase()));
  const item = data.items.find((i) => i.id === itemId);
  const isBox = unit === "box" && item?.hasBox;
  const unitSell = item ? (isBox ? item.boxSellPrice : item.sellPrice) : 0;
  const unitCost = item ? (isBox ? item.costPrice * item.piecesPerBox : item.costPrice) : 0;
  const total = unitSell * qty;
  const profit = (unitSell - unitCost) * qty;
  const piecesNeeded = item ? (isBox ? qty * item.piecesPerBox : qty) : 0;
  const notEnoughStock = item && piecesNeeded > item.stock;

  if (data.items.length === 0) {
    return (
      <Modal title="Record a sale" onClose={onClose}>
        <div className="empty-hint">Add items to your stock first, from the Stock tab.</div>
      </Modal>
    );
  }

  return (
    <Modal title="Record a sale" onClose={onClose}>
      <Field label="Item">
        <div className="search-box" style={{ marginBottom: 6 }}>
          <Search size={14} />
          <input placeholder="Search item" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <select value={itemId} onChange={(e) => { setItemId(e.target.value); setUnit("piece"); }}>
          {filteredItems.map((i) => (
            <option key={i.id} value={i.id}>{i.name} — {fmtMoney(i.sellPrice)} ({i.stock} pcs in stock)</option>
          ))}
        </select>
      </Field>

      {item?.hasBox && (
        <Field label="Sold as">
          <div className="chip-row">
            <button type="button" className={`chip ${unit === "piece" ? "active" : ""}`} onClick={() => setUnit("piece")}>Piece — {fmtMoney(item.sellPrice)}</button>
            <button type="button" className={`chip ${unit === "box" ? "active" : ""}`} onClick={() => setUnit("box")}>Box of {item.piecesPerBox} — {fmtMoney(item.boxSellPrice)}</button>
          </div>
        </Field>
      )}

      <Field label="Quantity">
        <input type="number" min="1" inputMode="numeric" value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} />
      </Field>
      {notEnoughStock && (
        <div className="hint-text"><AlertTriangle size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />Only {item.stock} pieces in stock — this will take it negative.</div>
      )}

      <label className="checkbox-row">
        <input type="checkbox" checked={credit} onChange={(e) => setCredit(e.target.checked)} />
        <span>Sold on khata (credit) instead of cash</span>
      </label>

      {credit && (
        <Field label="Customer">
          {data.customers.length === 0 ? (
            <div className="hint-text">Add a customer in the Khata tab first.</div>
          ) : (
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              {data.customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
        </Field>
      )}

      <div className="totals-box">
        <div><span>Total</span><b>{fmtMoney(total)}</b></div>
        <div><span>Profit</span><b className="green-text">{fmtMoney(profit)}</b></div>
      </div>

      <button
        className="btn-solid full"
        disabled={credit && !customerId}
        onClick={() => onSubmit({ itemId, qty, unit: isBox ? "box" : "piece", credit, customerId: credit ? customerId : null })}
      >
        <Check size={16} /> Confirm sale
      </button>
    </Modal>
  );
}

/* ---------------- Partners ---------------- */

function Partners({ data, persist, showToast }) {
  const { settings } = data;
  const totalProfit = data.sales.reduce((a, s) => a + s.profit, 0);
  const share = totalProfit / 2;

  const withdrawn = (n) => settings.withdrawals.filter((w) => w.partner === n).reduce((a, w) => a + w.amount, 0);
  const remaining = (n) => share - withdrawn(n);

  const [editingNames, setEditingNames] = useState(false);
  const [withdrawFor, setWithdrawFor] = useState(null);

  function saveNames(p1, p2) {
    persist({ ...data, settings: { ...settings, partner1: p1, partner2: p2 } });
    setEditingNames(false);
  }

  function addWithdrawal(partner, amount, note) {
    const amt = Number(amount);
    if (!amt) return;
    const w = { id: uid(), partner, amount: amt, note: note?.trim() || "", date: todayStr() };
    persist({ ...data, settings: { ...settings, withdrawals: [w, ...settings.withdrawals] } });
    setWithdrawFor(null);
    showToast("Withdrawal recorded");
  }

  const recentWithdrawals = [...settings.withdrawals].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8);

  return (
    <div className="pane">
      <div className="stat-row">
        <Stat label="Total profit to date" value={fmtMoney(totalProfit)} tone="green" />
        <Stat label="Split" value="50 / 50" />
      </div>

      <div className="partner-cards">
        {[1, 2].map((n) => (
          <div className="partner-card" key={n}>
            <div className="partner-name">{n === 1 ? settings.partner1 : settings.partner2}</div>
            <div className="partner-share">{fmtMoney(share)}</div>
            <div className="row-sub">lifetime share</div>
            <div className="partner-remaining">{fmtMoney(remaining(n))} <span>left to withdraw</span></div>
            <button className="btn-outline full" onClick={() => setWithdrawFor(n)}><Wallet size={14} /> Withdraw</button>
          </div>
        ))}
      </div>

      <button className="btn-text" onClick={() => setEditingNames(true)}><Pencil size={13} /> Edit partner names</button>

      <SectionLabel>Withdrawal history</SectionLabel>
      <div className="ledger-list">
        {recentWithdrawals.length === 0 && <div className="empty-hint">No withdrawals recorded yet.</div>}
        {recentWithdrawals.map((w) => (
          <LedgerRow key={w.id}>
            <div className="row-main">
              <div className="row-title">{w.partner === 1 ? settings.partner1 : settings.partner2}{w.note ? ` — ${w.note}` : ""}</div>
              <div className="row-sub">{fmtDate(w.date)}</div>
            </div>
            <div className="row-amt rust">−{fmtMoney(w.amount)}</div>
          </LedgerRow>
        ))}
      </div>

      {editingNames && (
        <Modal title="Partner names" onClose={() => setEditingNames(false)}>
          <NameForm p1={settings.partner1} p2={settings.partner2} onSave={saveNames} />
        </Modal>
      )}

      {withdrawFor && (
        <Modal title={`Withdrawal — ${withdrawFor === 1 ? settings.partner1 : settings.partner2}`} onClose={() => setWithdrawFor(null)}>
          <EntryForm kind="payment" onSubmit={(amt, note) => addWithdrawal(withdrawFor, amt, note)} />
        </Modal>
      )}
    </div>
  );
}

function NameForm({ p1, p2, onSave }) {
  const [a, setA] = useState(p1);
  const [b, setB] = useState(p2);
  return (
    <div>
      <Field label="Partner 1 name"><input value={a} onChange={(e) => setA(e.target.value)} /></Field>
      <Field label="Partner 2 name"><input value={b} onChange={(e) => setB(e.target.value)} /></Field>
      <button className="btn-solid full" onClick={() => onSave(a.trim() || "Partner 1", b.trim() || "Partner 2")}><Check size={16} /> Save</button>
    </div>
  );
}

/* ---------------- Styles ---------------- */

function ShopStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Lora:wght@500;600;700&family=Inter:wght@400;500;600&display=swap');

      .shop-app {
        --paper: #ECE2C8;
        --paper-light: #FBF7EC;
        --rule: #B23A2E;
        --rule-faint: #D8C9A3;
        --ink: #232A3B;
        --ink-soft: #6b6255;
        --green: #2F6B4F;
        --rust: #A8432E;
        --gold: #93691F;

        font-family: 'Inter', system-ui, -apple-system, sans-serif;
        color: var(--ink);
        background: var(--paper);
        background-image:
          linear-gradient(var(--paper), var(--paper)),
          repeating-linear-gradient(180deg, transparent, transparent 27px, rgba(178,58,46,0.08) 28px);
        max-width: 460px;
        margin: 0 auto;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        position: relative;
        border-left: 3px solid var(--rule);
        padding-left: 14px;
      }

      .loading-screen { padding: 40px 16px; font-style: italic; color: var(--ink-soft); }

      .app-header {
        padding: 18px 14px 14px 10px;
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        border-bottom: 2px solid var(--rule);
      }
      .header-stamp { display: flex; align-items: center; gap: 10px; }
      .stamp-ring {
        width: 40px; height: 40px; border-radius: 50%;
        border: 2px solid var(--gold);
        display: flex; align-items: center; justify-content: center;
        font-family: 'Lora', serif; font-weight: 700; font-size: 14px;
        color: var(--gold); flex-shrink: 0;
        transform: rotate(-6deg);
      }
      .app-header h1 { font-family: 'Lora', serif; font-size: 19px; margin: 0; font-weight: 700; line-height: 1.1; }
      .header-sub { font-size: 11px; color: var(--ink-soft); margin-top: 2px; }
      .header-today { text-align: right; }
      .header-today-label { font-size: 10px; color: var(--ink-soft); }
      .header-today-value { font-family: 'Lora', serif; font-size: 17px; font-weight: 600; color: var(--green); }

      .content { flex: 1; overflow-y: auto; padding: 4px 10px 90px 10px; }
      .pane { display: flex; flex-direction: column; gap: 12px; padding-top: 8px; }

      .section-label {
        font-size: 12px; color: var(--ink-soft); font-weight: 600;
        margin-top: 6px;
      }

      .stat-row { display: flex; gap: 8px; }
      .stat {
        flex: 1; background: var(--paper-light); border: 1px solid var(--rule-faint);
        border-radius: 6px; padding: 10px 8px; text-align: center;
      }
      .stat-value { font-family: 'Lora', serif; font-weight: 700; font-size: 15px; }
      .stat-label { font-size: 10px; color: var(--ink-soft); margin-top: 2px; }

      .chart-card { background: var(--paper-light); border: 1px solid var(--rule-faint); border-radius: 6px; padding: 8px 4px; }
      .empty-hint { font-size: 13px; color: var(--ink-soft); padding: 14px 4px; font-style: italic; }

      .ledger-list { display: flex; flex-direction: column; }
      .ledger-row {
        display: flex; justify-content: space-between; align-items: center;
        padding: 10px 6px; border-bottom: 1px solid var(--rule-faint);
        gap: 10px;
      }
      .ledger-row.clickable { cursor: pointer; }
      .ledger-row.clickable:active { background: rgba(178,58,46,0.06); }
      .row-title { font-size: 14px; font-weight: 600; }
      .row-sub { font-size: 11px; color: var(--ink-soft); margin-top: 1px; }
      .row-amt { font-family: ui-monospace, monospace; font-weight: 600; font-size: 13px; white-space: nowrap; }
      .row-amt.green { color: var(--green); }
      .row-amt.rust { color: var(--rust); }
      .row-end { display: flex; align-items: center; gap: 6px; flex-direction: column; }

      .btn-solid, .btn-outline, .btn-danger, .btn-text {
        font-family: inherit; font-size: 13px; font-weight: 600;
        border-radius: 6px; padding: 10px 14px; cursor: pointer;
        display: inline-flex; align-items: center; justify-content: center; gap: 6px;
        border: 1px solid transparent;
      }
      .btn-solid { background: var(--ink); color: var(--paper-light); }
      .btn-solid:disabled { opacity: 0.4; cursor: not-allowed; }
      .btn-outline { background: transparent; border: 1px solid var(--ink); color: var(--ink); }
      .btn-danger { background: transparent; border: 1px solid var(--rust); color: var(--rust); }
      .btn-text { background: none; border: none; color: var(--ink-soft); font-size: 12px; align-self: flex-start; padding: 4px 0; text-decoration: underline; }
      .full { width: 100%; }
      .two-btn-row { display: flex; gap: 8px; }
      .two-btn-row > * { flex: 1; }

      .search-row { display: flex; gap: 8px; align-items: center; }
      .search-box {
        flex: 1; display: flex; align-items: center; gap: 6px;
        background: var(--paper-light); border: 1px solid var(--rule-faint);
        border-radius: 6px; padding: 8px 10px; color: var(--ink-soft);
      }
      .search-box input { border: none; background: none; outline: none; flex: 1; font-size: 13px; color: var(--ink); }

      .chip-row { display: flex; gap: 6px; flex-wrap: wrap; }
      .chip {
        border: 1px solid var(--rule-faint); background: var(--paper-light);
        border-radius: 20px; padding: 5px 12px; font-size: 12px; cursor: pointer; color: var(--ink-soft);
      }
      .chip.active { background: var(--ink); color: var(--paper-light); border-color: var(--ink); }

      .tabbar {
        position: sticky; bottom: 0; display: flex; background: var(--paper-light);
        border-top: 2px solid var(--rule); max-width: 460px; width: 100%;
      }
      .tab-btn {
        flex: 1; background: none; border: none; padding: 8px 2px 10px 2px;
        display: flex; flex-direction: column; align-items: center; gap: 3px;
        color: var(--ink-soft); font-size: 10px; cursor: pointer; font-family: inherit;
      }
      .tab-btn.active { color: var(--rule); }

      .modal-backdrop {
        position: fixed; inset: 0; background: rgba(35,42,59,0.45);
        display: flex; align-items: flex-end; justify-content: center; z-index: 50;
      }
      .modal-sheet {
        background: var(--paper-light); width: 100%; max-width: 460px;
        border-radius: 14px 14px 0 0; max-height: 88vh; overflow-y: auto;
        border-top: 3px solid var(--rule);
      }
      .modal-head {
        display: flex; justify-content: space-between; align-items: center;
        padding: 14px 16px; font-family: 'Lora', serif; font-weight: 700; font-size: 15px;
        border-bottom: 1px solid var(--rule-faint); position: sticky; top: 0; background: var(--paper-light);
      }
      .modal-body { padding: 14px 16px 22px 16px; display: flex; flex-direction: column; gap: 12px; }
      .icon-btn { background: none; border: none; cursor: pointer; color: var(--ink-soft); }

      .field { display: flex; flex-direction: column; gap: 5px; font-size: 12px; color: var(--ink-soft); }
      .field input, .field select {
        font-family: inherit; font-size: 14px; color: var(--ink);
        border: 1px solid var(--rule-faint); border-radius: 6px; padding: 9px 10px; background: #fff;
        width: 100%;
      }
      .field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .hint-text { font-size: 11px; color: var(--ink-soft); }
      .modal-actions { display: flex; gap: 8px; align-items: center; }
      .checkbox-row { display: flex; align-items: center; gap: 8px; font-size: 13px; }

      .restock-box {
        background: var(--paper); border: 1px solid var(--rule-faint); border-radius: 6px;
        padding: 10px; display: flex; flex-direction: column; gap: 6px;
      }
      .restock-label { font-size: 11px; color: var(--ink-soft); font-weight: 600; }

      .totals-box {
        background: var(--paper); border: 1px dashed var(--rule); border-radius: 6px; padding: 10px 12px;
        display: flex; flex-direction: column; gap: 4px;
      }
      .totals-box > div { display: flex; justify-content: space-between; font-size: 13px; }
      .green-text { color: var(--green); }

      .scanner-wrap { position: relative; border-radius: 8px; overflow: hidden; background: #000; }
      .scanner-video { width: 100%; display: block; max-height: 240px; object-fit: cover; }
      .scanner-reticle {
        position: absolute; inset: 20% 12%; border: 2px solid #fff; border-radius: 8px; opacity: 0.85;
      }

      .back-link { background: none; border: none; color: var(--ink-soft); font-size: 12px; display: flex; align-items: center; gap: 4px; cursor: pointer; padding: 0; align-self: flex-start; }
      .customer-head { display: flex; justify-content: space-between; align-items: flex-start; }
      .customer-head h2 { font-family: 'Lora', serif; font-size: 18px; margin: 0; }
      .balance-badge { text-align: right; font-family: ui-monospace, monospace; font-weight: 700; font-size: 16px; }
      .balance-badge span { display: block; font-family: 'Inter', sans-serif; font-weight: 400; font-size: 10px; color: var(--ink-soft); }
      .balance-badge.rust { color: var(--rust); }
      .balance-badge.green { color: var(--green); }

      .partner-cards { display: flex; gap: 10px; }
      .partner-card {
        flex: 1; background: var(--paper-light); border: 1px solid var(--rule-faint); border-radius: 8px;
        padding: 12px; display: flex; flex-direction: column; gap: 4px; align-items: flex-start;
      }
      .partner-name { font-size: 12px; color: var(--ink-soft); font-weight: 600; }
      .partner-share { font-family: 'Lora', serif; font-size: 18px; font-weight: 700; color: var(--green); }
      .partner-remaining { font-size: 11px; margin: 6px 0 8px 0; }
      .partner-remaining span { color: var(--ink-soft); }

      .toast {
        position: fixed; bottom: 78px; left: 50%; transform: translateX(-50%);
        background: var(--ink); color: var(--paper-light); padding: 8px 16px; border-radius: 20px;
        font-size: 12px; z-index: 60;
      }
    `}</style>
  );
}
