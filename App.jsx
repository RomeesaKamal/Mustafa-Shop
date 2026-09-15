import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Home, Package, BookOpen, ShoppingCart, Users, Plus, X, Check,
  Trash2, Pencil, Phone, ScanLine, Search, ArrowLeft, AlertTriangle,
  Wallet, ChevronRight, Camera, Receipt, MessageSquare, Printer,
  Archive, Image as ImageIcon, MoreHorizontal, Lightbulb, PiggyBank,
  Cookie, PenLine, FileText, Undo2,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const STORAGE_KEY = "mustafas-shop-data-v2";
const OLD_STORAGE_KEY = "mustafas-shop-data-v1";

/* ---------------- Departments ----------------
   The shop runs three counters. Every item and every sale is tagged with one,
   so the dashboard can show which counter earned what. */

const DEPTS = {
  snacks: { label: "Snacks", icon: Cookie, color: "var(--snacks)" },
  stationery: { label: "Stationery", icon: PenLine, color: "var(--stationery)" },
  printing: { label: "Photocopy & Printing", icon: Printer, color: "var(--printing)" },
};

const CATEGORIES = [
  { key: "Snacks", dept: "snacks" },
  { key: "Cold Drinks", dept: "snacks" },
  { key: "Stationery", dept: "stationery" },
  { key: "Printing Supplies", dept: "printing" },
];

const deptOfCategory = (c) => (CATEGORIES.find((x) => x.key === c) || CATEGORIES[0]).dept;

const DEFAULT_PRINT_RATES = [
  { id: "photocopy", label: "Photocopy", rate: 5, cost: 2, unit: "page" },
  { id: "print_bw", label: "Print (black & white)", rate: 10, cost: 3, unit: "page" },
  { id: "print_color", label: "Print (colour)", rate: 30, cost: 12, unit: "page" },
  { id: "scan", label: "Scan / email", rate: 20, cost: 0, unit: "page" },
  { id: "binding", label: "Spiral binding", rate: 60, cost: 25, unit: "job" },
  { id: "lamination", label: "Lamination", rate: 50, cost: 20, unit: "sheet" },
];

/* ---------------- Storage ----------------
   Saves to this browser/device. Each device keeps its own copy. */

const storage = {
  get(key) {
    const raw = window.localStorage.getItem(key);
    return raw ? { value: raw } : null;
  },
  set(key, value) {
    window.localStorage.setItem(key, value);
    return { key, value };
  },
};

const emptyData = () => ({
  items: [],
  sales: [],
  customers: [],
  bills: [],
  suggestions: [],
  settings: {
    partner1: "Partner 1",
    partner2: "Partner 2",
    withdrawals: [],
    reinvestPct: 30,
    printRates: DEFAULT_PRINT_RATES,
  },
});

function migrate(parsed) {
  const base = emptyData();
  const merged = {
    ...base,
    ...parsed,
    settings: { ...base.settings, ...(parsed.settings || {}) },
  };
  merged.items = (merged.items || []).map((i) => ({
    ...i,
    dept: i.dept || deptOfCategory(i.category),
  }));
  merged.sales = (merged.sales || []).map((s) => ({
    ...s,
    dept: s.dept || (s.isService ? "printing" : deptOfCategory(s.category || "Snacks")),
  }));
  merged.customers = (merged.customers || []).map((c) => ({
    ...c,
    status: c.status || "active",
    createdAt: c.createdAt || todayStr(),
  }));
  if (!merged.settings.printRates || merged.settings.printRates.length === 0) {
    merged.settings.printRates = DEFAULT_PRINT_RATES;
  }
  return merged;
}

/* ---------------- Helpers ---------------- */

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

async function compressImage(file, maxDim = 900, quality = 0.6) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new window.Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("bad image"));
      i.src = url;
    });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function lookupBarcode(code) {
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json`);
    const json = await res.json();
    if (json && json.status === 1 && json.product) {
      const p = json.product;
      return { name: p.product_name || p.generic_name || "", brand: p.brands || "" };
    }
  } catch (e) { /* offline or blocked */ }
  return null;
}

/* ---------------- Primitives ---------------- */

function Row({ children, onClick, accent, className = "" }) {
  return (
    <div
      onClick={onClick}
      className={`row ${onClick ? "clickable" : ""} ${className}`}
      style={accent ? { borderLeftColor: accent, borderLeftWidth: 3, borderLeftStyle: "solid" } : undefined}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children, action }) {
  return (
    <div className="section-label">
      <span>{children}</span>
      {action}
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className="stat">
      <div className="stat-value" style={tone ? { color: `var(--${tone})` } : undefined}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>{title}</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <em className="field-hint">{hint}</em>}
    </label>
  );
}

function EmptyState({ children }) {
  return <div className="empty-state">{children}</div>;
}

/* ---------------- Barcode scanner ---------------- */

function ScannerModal({ title = "Scan barcode", onClose, onDetect }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [supported, setSupported] = useState(true);
  const [error, setError] = useState("");
  const [manual, setManual] = useState("");
  const detectRef = useRef(onDetect);
  detectRef.current = onDetect;

  useEffect(() => {
    let raf;
    let detector;
    let cancelled = false;

    async function start() {
      if (!("BarcodeDetector" in window)) { setSupported(false); return; }
      try {
        detector = new window.BarcodeDetector({
          formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"],
        });
      } catch (e) { setSupported(false); return; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
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
            if (codes && codes.length > 0) { detectRef.current(codes[0].rawValue); return; }
          } catch (e) { /* keep trying */ }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch (e) {
        setError("The camera is blocked. Allow camera access in your browser settings, or type the code below.");
      }
    }
    start();
    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <Modal title={title} onClose={onClose}>
      {supported && !error ? (
        <div className="scanner-wrap">
          <video ref={videoRef} muted playsInline className="scanner-video" />
          <div className="scanner-reticle" />
          <div className="scanner-hint">Hold the barcode inside the box</div>
        </div>
      ) : (
        <div className="notice">
          <AlertTriangle size={15} />
          <span>{error || "This browser cannot scan with the camera. Chrome on Android works best. Type the code below instead."}</span>
        </div>
      )}
      <Field label="Or type the barcode">
        <div className="inline-row">
          <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="8964000123456" inputMode="numeric" />
          <button className="btn primary" onClick={() => manual.trim() && detectRef.current(manual.trim())}>Use</button>
        </div>
      </Field>
    </Modal>
  );
}

/* ---------------- Photo identify (on-device) ---------------- */

function PhotoIdentifyModal({ onClose, onIdentified }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const modelRef = useRef(null);
  const [status, setStatus] = useState("starting");
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
        setError("The camera is blocked. Allow camera access, or type the name yourself.");
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
    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth || 320;
      canvas.height = video.videoHeight || 240;
      canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);

      if (!modelRef.current) {
        const tf = await import("@tensorflow/tfjs");
        await tf.ready();
        const mobilenet = await import("@tensorflow-models/mobilenet");
        modelRef.current = await mobilenet.load({ version: 2, alpha: 0.5 });
      }
      const preds = await modelRef.current.classify(canvas, 3);
      setPredictions(preds || []);
      setStatus("ready");
    } catch (e) {
      setError("Could not read the photo. Type the name instead.");
      setStatus("error");
    }
  }

  function pick(label) {
    const clean = label.split(",")[0].trim();
    onIdentified(clean.charAt(0).toUpperCase() + clean.slice(1));
  }

  return (
    <Modal title="Name it from a photo" onClose={onClose}>
      {status !== "error" ? (
        <>
          <div className="scanner-wrap">
            <video ref={videoRef} muted playsInline className="scanner-video" />
            <div className="scanner-hint">Fill the frame with the product</div>
          </div>
          <canvas ref={canvasRef} style={{ display: "none" }} />
          <button className="btn primary block" onClick={capture} disabled={status === "classifying"}>
            <Camera size={16} /> {status === "classifying" ? "Reading the photo…" : "Take photo"}
          </button>
        </>
      ) : (
        <div className="notice"><AlertTriangle size={15} /><span>{error}</span></div>
      )}

      {predictions && (
        <div>
          <SectionLabel>Closest guesses</SectionLabel>
          {predictions.length === 0 && <EmptyState>Nothing recognised. Type the name instead.</EmptyState>}
          {predictions.map((p) => (
            <Row key={p.className} onClick={() => pick(p.className)}>
              <div className="row-main">
                <div className="row-title">{p.className.split(",")[0]}</div>
                <div className="row-sub">{Math.round(p.probability * 100)}% sure</div>
              </div>
              <ChevronRight size={16} color="var(--ink-soft)" />
            </Row>
          ))}
          <p className="fine-print">
            The guess comes from a general photo model, so it recognises shapes like “bottle” or “notebook”, not brand names.
            Fix the name by hand if it is wrong.
          </p>
        </div>
      )}
    </Modal>
  );
}

/* ---------------- App ---------------- */

export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("home");
  const [toast, setToast] = useState("");

  useEffect(() => {
    try {
      const res = storage.get(STORAGE_KEY) || storage.get(OLD_STORAGE_KEY);
      setData(res && res.value ? migrate(JSON.parse(res.value)) : emptyData());
    } catch (e) {
      setData(emptyData());
    } finally {
      setLoading(false);
    }
  }, []);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2400);
  }, []);

  const persist = useCallback((next) => {
    setData(next);
    try {
      storage.set(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      showToast("Storage is full. Delete a few bill photos to free space.");
    }
  }, [showToast]);

  if (loading || !data) {
    return (
      <div className="shop-app">
        <ShopStyles />
        <div className="loading-screen">Opening the shop…</div>
      </div>
    );
  }

  const shared = { data, persist, showToast };

  return (
    <div className="shop-app">
      <ShopStyles />
      <Header data={data} />
      <main className="content">
        {tab === "home" && <Dashboard data={data} setTab={setTab} />}
        {tab === "stock" && <Stock {...shared} />}
        {tab === "sales" && <Sales {...shared} />}
        {tab === "khata" && <Khata {...shared} />}
        {tab === "more" && <More {...shared} />}
      </main>
      <nav className="tabbar">
        <TabBtn icon={Home} label="Home" active={tab === "home"} onClick={() => setTab("home")} />
        <TabBtn icon={Package} label="Stock" active={tab === "stock"} onClick={() => setTab("stock")} />
        <TabBtn icon={ShoppingCart} label="Sales" active={tab === "sales"} onClick={() => setTab("sales")} />
        <TabBtn icon={BookOpen} label="Khata" active={tab === "khata"} onClick={() => setTab("khata")} />
        <TabBtn icon={MoreHorizontal} label="More" active={tab === "more"} onClick={() => setTab("more")} />
      </nav>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function TabBtn({ icon: Icon, label, active, onClick }) {
  return (
    <button className={`tab-btn ${active ? "active" : ""}`} onClick={onClick}>
      <Icon size={20} strokeWidth={active ? 2.3 : 1.7} />
      <span>{label}</span>
    </button>
  );
}

function Header({ data }) {
  const today = data.sales.filter((s) => s.date === todayStr());
  const todaySales = today.reduce((a, s) => a + s.total, 0);
  return (
    <header className="app-header">
      <div className="brand">
        <div className="brand-mark">MS</div>
        <div>
          <h1>Mustafa&apos;s Shop</h1>
          <div className="brand-sub">Snacks · Stationery · Photocopy &amp; Printing</div>
        </div>
      </div>
      <div className="header-today">
        <div className="header-today-label">Sold today</div>
        <div className="header-today-value">{fmtMoney(todaySales)}</div>
      </div>
    </header>
  );
}

/* ---------------- Dashboard ---------------- */

function Dashboard({ data, setTab }) {
  const today = todayStr();
  const todaySales = data.sales.filter((s) => s.date === today);
  const todayTotal = todaySales.reduce((a, s) => a + s.total, 0);
  const todayProfit = todaySales.reduce((a, s) => a + s.profit, 0);

  const byDept = Object.keys(DEPTS).map((key) => ({
    key,
    ...DEPTS[key],
    total: todaySales.filter((s) => s.dept === key).reduce((a, s) => a + s.total, 0),
  }));

  const stockValue = data.items.reduce((a, i) => a + i.costPrice * i.stock, 0);
  const totalOwed = data.customers.filter((c) => c.status !== "closed").reduce((a, c) => a + Math.max(0, c.balance), 0);
  const unpaidBills = data.bills.filter((b) => !b.paid).reduce((a, b) => a + b.amount, 0);
  const lowStock = data.items.filter((i) => i.stock <= (i.lowStockAt ?? 5));
  const newSuggestions = data.suggestions.filter((s) => s.status === "new").length;

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

  const totalProfit = data.sales.reduce((a, s) => a + s.profit, 0);

  return (
    <div className="pane">
      <div className="today-card">
        <div className="today-label">Today&apos;s takings</div>
        <div className="today-value">{fmtMoney(todayTotal)}</div>
        <div className="today-profit">{fmtMoney(todayProfit)} profit from {todaySales.length} {todaySales.length === 1 ? "sale" : "sales"}</div>
        <div className="dept-bar">
          {byDept.map((d) => {
            const Icon = d.icon;
            return (
              <div className="dept-cell" key={d.key}>
                <Icon size={15} color={d.color} />
                <div className="dept-amt">{fmtMoney(d.total)}</div>
                <div className="dept-name">{d.label}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="stat-row">
        <Stat label="Stock value" value={fmtMoney(stockValue)} />
        <Stat label="Udhaar owed" value={fmtMoney(totalOwed)} tone="due" />
        <Stat label="Bills unpaid" value={fmtMoney(unpaidBills)} tone="warn" />
      </div>

      <SectionLabel>Profit over the last 14 days</SectionLabel>
      <div className="card chart-card">
        {totalProfit === 0 ? (
          <EmptyState>Record your first sale and the profit line starts here.</EmptyState>
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData} margin={{ top: 8, right: 10, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--ink-soft)" }} interval={2} axisLine={{ stroke: "var(--line)" }} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "var(--ink-soft)" }} axisLine={false} tickLine={false} width={42} />
              <Tooltip
                formatter={(v) => fmtMoney(v)}
                contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", fontSize: 12, borderRadius: 8 }}
              />
              <Line type="monotone" dataKey="profit" stroke="var(--brand)" strokeWidth={2.2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {lowStock.length > 0 && (
        <>
          <SectionLabel>Running low</SectionLabel>
          <div className="card list">
            {lowStock.slice(0, 6).map((i) => (
              <Row key={i.id} accent={DEPTS[i.dept]?.color}>
                <div className="row-main">
                  <div className="row-title">{i.name}</div>
                  <div className="row-sub">{i.category}</div>
                </div>
                <div className="row-amt due">{i.stock} left</div>
              </Row>
            ))}
          </div>
        </>
      )}

      {newSuggestions > 0 && (
        <button className="btn ghost block" onClick={() => setTab("more")}>
          <Lightbulb size={16} /> {newSuggestions} customer {newSuggestions === 1 ? "suggestion" : "suggestions"} to read
        </button>
      )}

      <button className="btn primary block" onClick={() => setTab("sales")}>
        <Plus size={16} /> Record a sale
      </button>
    </div>
  );
}

/* ---------------- Stock ---------------- */

function Stock({ data, persist, showToast }) {
  const [query, setQuery] = useState("");
  const [dept, setDept] = useState("all");
  const [editing, setEditing] = useState(null);      // item object or "new"
  const [scanning, setScanning] = useState(false);
  const [restocking, setRestocking] = useState(null); // existing item matched by scan
  const [prefill, setPrefill] = useState(null);

  const filtered = data.items.filter((i) => {
    const q = query.trim().toLowerCase();
    const matchesQ = !q || i.name.toLowerCase().includes(q) || (i.barcode || "").includes(q);
    return matchesQ && (dept === "all" || i.dept === dept);
  });

  function saveItem(item) {
    const items = [...data.items];
    const idx = items.findIndex((i) => i.id === item.id);
    if (idx >= 0) items[idx] = item; else items.push(item);
    persist({ ...data, items });
    setEditing(null);
    setPrefill(null);
    showToast(idx >= 0 ? "Item updated" : "Added to stock");
  }

  function deleteItem(id) {
    persist({ ...data, items: data.items.filter((i) => i.id !== id) });
    setEditing(null);
    showToast("Item removed");
  }

  function applyRestock(item, addPieces, newCost, newSell) {
    const items = data.items.map((i) => (i.id === item.id ? {
      ...i,
      stock: i.stock + addPieces,
      costPrice: newCost ?? i.costPrice,
      sellPrice: newSell ?? i.sellPrice,
    } : i));
    persist({ ...data, items });
    setRestocking(null);
    showToast(`${addPieces} added to ${item.name}`);
  }

  async function handleScan(code) {
    setScanning(false);
    const existing = data.items.find((i) => i.barcode && i.barcode === code);
    if (existing) {
      setRestocking(existing);
      return;
    }
    setPrefill({ barcode: code });
    setEditing("new");
  }

  return (
    <div className="pane">
      <button className="scan-cta" onClick={() => setScanning(true)}>
        <ScanLine size={22} />
        <div>
          <strong>Scan an item</strong>
          <span>Known item? Stock goes up in one tap. New item? The form fills itself.</span>
        </div>
      </button>

      <div className="inline-row">
        <div className="search-box">
          <Search size={15} />
          <input placeholder="Search name or barcode" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <button className="btn outline" onClick={() => { setPrefill(null); setEditing("new"); }}><Plus size={16} /> Add</button>
      </div>

      <div className="chip-row">
        <button className={`chip ${dept === "all" ? "active" : ""}`} onClick={() => setDept("all")}>All</button>
        {Object.entries(DEPTS).map(([key, d]) => (
          <button key={key} className={`chip ${dept === key ? "active" : ""}`} onClick={() => setDept(key)}>
            {key === "printing" ? "Printing" : d.label}
          </button>
        ))}
      </div>

      <div className="card list">
        {filtered.length === 0 && (
          <EmptyState>
            {data.items.length === 0
              ? "No stock yet. Scan an item or tap Add to enter the first one."
              : "Nothing matches that search."}
          </EmptyState>
        )}
        {filtered.map((i) => (
          <Row key={i.id} onClick={() => setEditing(i)} accent={DEPTS[i.dept]?.color}>
            <div className="row-main">
              <div className="row-title">{i.name}</div>
              <div className="row-sub">
                {i.category} · earns {fmtMoney(i.sellPrice - i.costPrice)} a piece
                {i.hasBox ? ` · box of ${i.piecesPerBox}` : ""}
              </div>
            </div>
            <div className="row-end">
              <div className="row-amt">{fmtMoney(i.sellPrice)}</div>
              <div className={`row-sub ${i.stock <= (i.lowStockAt ?? 5) ? "due" : ""}`}>
                {i.stock} pcs{i.hasBox ? ` (~${Math.floor(i.stock / i.piecesPerBox)} box)` : ""}
              </div>
            </div>
          </Row>
        ))}
      </div>

      {scanning && <ScannerModal title="Scan to add stock" onClose={() => setScanning(false)} onDetect={handleScan} />}

      {restocking && (
        <QuickRestockModal
          item={restocking}
          onClose={() => setRestocking(null)}
          onApply={applyRestock}
        />
      )}

      {editing && (
        <ItemModal
          item={editing === "new" ? null : editing}
          prefill={prefill}
          onClose={() => { setEditing(null); setPrefill(null); }}
          onSave={saveItem}
          onDelete={deleteItem}
        />
      )}
    </div>
  );
}

function QuickRestockModal({ item, onClose, onApply }) {
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("piece");
  const [changePrices, setChangePrices] = useState(false);
  const [cost, setCost] = useState(item.costPrice);
  const [sell, setSell] = useState(item.sellPrice);

  const addPieces = unit === "box" ? Number(qty || 0) * (item.piecesPerBox || 1) : Number(qty || 0);

  return (
    <Modal title="Already in your stock" onClose={onClose}>
      <div className="matched-card">
        <div className="matched-name">{item.name}</div>
        <div className="row-sub">{item.category} · {item.stock} pieces on the shelf · sells at {fmtMoney(item.sellPrice)}</div>
      </div>

      <Field label="How many arrived">
        <div className="inline-row">
          <input type="number" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" autoFocus />
          <select value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option value="piece">Pieces</option>
            {item.hasBox && <option value="box">Boxes of {item.piecesPerBox}</option>}
          </select>
        </div>
      </Field>

      <label className="check-row">
        <input type="checkbox" checked={changePrices} onChange={(e) => setChangePrices(e.target.checked)} />
        <span>The price changed this time</span>
      </label>

      {changePrices && (
        <div className="field-grid">
          <Field label="Cost per piece">
            <input type="number" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
          </Field>
          <Field label="Selling price">
            <input type="number" inputMode="decimal" value={sell} onChange={(e) => setSell(e.target.value)} />
          </Field>
        </div>
      )}

      {addPieces > 0 && (
        <div className="totals">
          <div><span>New shelf count</span><b>{item.stock + addPieces} pieces</b></div>
        </div>
      )}

      <button
        className="btn primary block"
        disabled={!addPieces}
        onClick={() => onApply(item, addPieces, changePrices ? Number(cost) : undefined, changePrices ? Number(sell) : undefined)}
      >
        <Check size={16} /> Add to stock
      </button>
    </Modal>
  );
}

function ItemModal({ item, prefill, onClose, onSave, onDelete }) {
  const [name, setName] = useState(item?.name || "");
  const [category, setCategory] = useState(item?.category || "Snacks");
  const [barcode, setBarcode] = useState(item?.barcode || prefill?.barcode || "");
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
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Look the barcode up once, when the modal opens with a scanned code and no name yet.
  useEffect(() => {
    let cancelled = false;
    if (prefill?.barcode && !item) {
      setLooking(true);
      lookupBarcode(prefill.barcode).then((found) => {
        if (cancelled) return;
        setLooking(false);
        if (found?.name) setName(found.brand ? `${found.name} (${found.brand})` : found.name);
      });
    }
    return () => { cancelled = true; };
  }, [prefill, item]);

  async function handleDetected(code) {
    setBarcode(code);
    setScanning(false);
    setLooking(true);
    const found = await lookupBarcode(code);
    setLooking(false);
    if (found?.name && !name) setName(found.brand ? `${found.name} (${found.brand})` : found.name);
  }

  function submit() {
    if (!name.trim() || costPrice === "" || sellPrice === "" || stock === "") return;
    if (hasBox && (!piecesPerBox || !boxSellPrice)) return;
    onSave({
      id: item?.id || uid(),
      name: name.trim(),
      category,
      dept: deptOfCategory(category),
      barcode: barcode.trim(),
      costPrice: Number(costPrice),
      sellPrice: Number(sellPrice),
      stock: Number(stock),
      lowStockAt: Number(lowStockAt) || 5,
      hasBox,
      piecesPerBox: hasBox ? Number(piecesPerBox) : null,
      boxSellPrice: hasBox ? Number(boxSellPrice) : null,
      createdAt: item?.createdAt || todayStr(),
    });
  }

  return (
    <Modal title={item ? "Edit item" : "New item"} onClose={onClose}>
      <Field label="Barcode" hint="Scan it once. Next time the same code goes straight to restock.">
        <div className="inline-row">
          <input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Scan or type" inputMode="numeric" />
          <button type="button" className="btn outline square" onClick={() => setScanning(true)} title="Scan barcode"><ScanLine size={16} /></button>
          <button type="button" className="btn outline square" onClick={() => setIdentifying(true)} title="Name from photo"><Camera size={16} /></button>
        </div>
        {looking && <em className="field-hint">Looking the code up online…</em>}
      </Field>

      <Field label="Item name">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dolphin notebook 100pg" />
      </Field>

      <Field label="Counter">
        <div className="chip-row">
          {CATEGORIES.map((c) => (
            <button key={c.key} type="button" className={`chip ${category === c.key ? "active" : ""}`} onClick={() => setCategory(c.key)}>{c.key}</button>
          ))}
        </div>
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
        <Field label="Pieces in hand">
          <input type="number" inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="0" />
        </Field>
        <Field label="Warn me below">
          <input type="number" inputMode="numeric" value={lowStockAt} onChange={(e) => setLowStockAt(e.target.value)} />
        </Field>
      </div>

      {costPrice !== "" && sellPrice !== "" && (
        <div className="totals">
          <div><span>You earn per piece</span><b className="good">{fmtMoney(Number(sellPrice || 0) - Number(costPrice || 0))}</b></div>
        </div>
      )}

      <label className="check-row">
        <input type="checkbox" checked={hasBox} onChange={(e) => setHasBox(e.target.checked)} />
        <span>Also sold as a full box or carton</span>
      </label>

      {hasBox && (
        <>
          <div className="field-grid">
            <Field label="Pieces per box">
              <input type="number" inputMode="numeric" value={piecesPerBox} onChange={(e) => setPiecesPerBox(e.target.value)} placeholder="24" />
            </Field>
            <Field label="Box price">
              <input type="number" inputMode="decimal" value={boxSellPrice} onChange={(e) => setBoxSellPrice(e.target.value)} placeholder="550" />
            </Field>
          </div>
          {piecesPerBox !== "" && costPrice !== "" && boxSellPrice !== "" && (
            <div className="totals">
              <div><span>Box costs you</span><b>{fmtMoney(Number(piecesPerBox) * Number(costPrice))}</b></div>
              <div><span>Box earns you</span><b className="good">{fmtMoney(Number(boxSellPrice) - Number(piecesPerBox) * Number(costPrice))}</b></div>
            </div>
          )}
        </>
      )}

      <button className="btn primary block" onClick={submit}>
        <Check size={16} /> {item ? "Save changes" : "Add to stock"}
      </button>

      {item && (
        confirmDelete ? (
          <div className="danger-zone">
            <span>Remove {item.name} from stock? Past sales stay in the record.</span>
            <div className="inline-row">
              <button className="btn ghost" onClick={() => setConfirmDelete(false)}>Keep it</button>
              <button className="btn danger" onClick={() => onDelete(item.id)}><Trash2 size={15} /> Remove</button>
            </div>
          </div>
        ) : (
          <button className="btn text" onClick={() => setConfirmDelete(true)}><Trash2 size={14} /> Remove this item</button>
        )
      )}

      {scanning && <ScannerModal onClose={() => setScanning(false)} onDetect={handleDetected} />}
      {identifying && <PhotoIdentifyModal onClose={() => setIdentifying(false)} onIdentified={(label) => { setIdentifying(false); setName(label); }} />}
    </Modal>
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
        ? {
            ...c,
            balance: c.balance + total,
            history: [{ id: uid(), kind: "borrow", amount: total, note, date: todayStr(), createdAt: new Date().toISOString() }, ...c.history],
          }
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
      dept: item.dept,
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

  function recordService({ description, qty, amount, cost, credit, customerId }) {
    if (!description.trim() || !amount) return;
    const total = Number(amount);
    const profit = total - (Number(cost) || 0);
    const sale = {
      id: uid(),
      itemId: null,
      itemName: description.trim(),
      dept: "printing",
      qty: Number(qty) || 1,
      unit: "job",
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
    showToast("Job recorded");
  }

  return (
    <div className="pane">
      <div className="stat-row">
        <Stat label="Total sold" value={fmtMoney(totalRevenue)} />
        <Stat label="Total profit" value={fmtMoney(totalProfit)} tone="good" />
      </div>

      <div className="btn-pair">
        <button className="btn primary block" onClick={() => setRecording(true)}><Plus size={16} /> Sell an item</button>
        <button className="btn outline block" onClick={() => setServicing(true)}><Printer size={16} /> Photocopy / print job</button>
      </div>

      <SectionLabel>Everything sold</SectionLabel>
      <div className="card list">
        {sorted.length === 0 && <EmptyState>Nothing sold yet. Your first sale shows up here.</EmptyState>}
        {sorted.slice(0, 60).map((s) => (
          <Row key={s.id} accent={DEPTS[s.dept]?.color}>
            <div className="row-main">
              <div className="row-title">{s.itemName}{!s.isService ? ` × ${s.qty}` : ""}</div>
              <div className="row-sub">{fmtDate(s.date)} · {fmtMoney(s.total)} · {s.credit ? "on khata" : "cash"}</div>
            </div>
            <div className="row-amt good">+{fmtMoney(s.profit)}</div>
          </Row>
        ))}
      </div>

      {recording && <SaleModal data={data} onClose={() => setRecording(false)} onSubmit={recordSale} />}
      {servicing && <ServiceSaleModal data={data} onClose={() => setServicing(false)} onSubmit={recordService} />}
    </div>
  );
}

function CustomerPicker({ data, credit, setCredit, customerId, setCustomerId }) {
  const active = data.customers.filter((c) => c.status !== "closed");
  return (
    <>
      <label className="check-row">
        <input type="checkbox" checked={credit} onChange={(e) => setCredit(e.target.checked)} />
        <span>On khata instead of cash</span>
      </label>
      {credit && (
        <Field label="Whose khata">
          {active.length === 0 ? (
            <em className="field-hint">No customers yet. Add one in the Khata tab first.</em>
          ) : (
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Choose a customer</option>
              {active.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </Field>
      )}
    </>
  );
}

function ServiceSaleModal({ data, onClose, onSubmit }) {
  const rates = data.settings.printRates;
  const [rateId, setRateId] = useState(rates[0]?.id || "");
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState("");
  const [cost, setCost] = useState("");
  const [credit, setCredit] = useState(false);
  const [customerId, setCustomerId] = useState("");

  const rate = rates.find((r) => r.id === rateId);
  const autoAmount = rate ? rate.rate * (Number(qty) || 0) : 0;
  const autoCost = rate ? rate.cost * (Number(qty) || 0) : 0;
  const finalAmount = amount === "" ? autoAmount : Number(amount);
  const finalCost = cost === "" ? autoCost : Number(cost);
  const description = rate ? `${rate.label}${qty > 1 ? ` × ${qty}` : ""}${note.trim() ? ` — ${note.trim()}` : ""}` : note;

  return (
    <Modal title="Photocopy & printing" onClose={onClose}>
      <Field label="What was done">
        <div className="chip-row">
          {rates.map((r) => (
            <button key={r.id} type="button" className={`chip ${rateId === r.id ? "active" : ""}`} onClick={() => { setRateId(r.id); setAmount(""); setCost(""); }}>
              {r.label}
            </button>
          ))}
        </div>
      </Field>

      <div className="field-grid">
        <Field label={rate ? `How many ${rate.unit}s` : "How many"}>
          <input type="number" min="1" inputMode="numeric" value={qty} onChange={(e) => { setQty(Math.max(1, Number(e.target.value) || 1)); setAmount(""); setCost(""); }} />
        </Field>
        <Field label="Charged" hint={amount === "" ? `Auto at ${fmtMoney(rate?.rate || 0)} each` : "Edited by hand"}>
          <input type="number" inputMode="decimal" value={amount === "" ? autoAmount : amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
      </div>

      <Field label="Paper and ink cost" hint="Used to work out real profit. Change it if this job used more.">
        <input type="number" inputMode="decimal" value={cost === "" ? autoCost : cost} onChange={(e) => setCost(e.target.value)} />
      </Field>

      <Field label="Note (optional)">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="CNIC copies for Ali" />
      </Field>

      <CustomerPicker data={data} credit={credit} setCredit={setCredit} customerId={customerId} setCustomerId={setCustomerId} />

      <div className="totals">
        <div><span>Customer pays</span><b>{fmtMoney(finalAmount)}</b></div>
        <div><span>You keep</span><b className="good">{fmtMoney(finalAmount - finalCost)}</b></div>
      </div>

      <button
        className="btn primary block"
        disabled={!finalAmount || (credit && !customerId)}
        onClick={() => onSubmit({ description, qty, amount: finalAmount, cost: finalCost, credit, customerId: credit ? customerId : null })}
      >
        <Check size={16} /> Record job
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
  const [customerId, setCustomerId] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanMiss, setScanMiss] = useState("");

  const filteredItems = data.items.filter((i) => i.name.toLowerCase().includes(query.toLowerCase()));
  const item = data.items.find((i) => i.id === itemId);
  const isBox = unit === "box" && item?.hasBox;
  const unitSell = item ? (isBox ? item.boxSellPrice : item.sellPrice) : 0;
  const unitCost = item ? (isBox ? item.costPrice * item.piecesPerBox : item.costPrice) : 0;
  const total = unitSell * qty;
  const profit = (unitSell - unitCost) * qty;
  const piecesNeeded = item ? (isBox ? qty * item.piecesPerBox : qty) : 0;
  const notEnough = item && piecesNeeded > item.stock;

  function handleScan(code) {
    setScanning(false);
    const found = data.items.find((i) => i.barcode && i.barcode === code);
    if (found) { setItemId(found.id); setUnit("piece"); setScanMiss(""); }
    else setScanMiss(`No item saved under ${code}. Add it from the Stock tab.`);
  }

  if (data.items.length === 0) {
    return (
      <Modal title="Sell an item" onClose={onClose}>
        <EmptyState>Your shelf is empty in the app. Add stock first, then come back to sell.</EmptyState>
      </Modal>
    );
  }

  return (
    <Modal title="Sell an item" onClose={onClose}>
      <Field label="Item">
        <div className="inline-row" style={{ marginBottom: 8 }}>
          <div className="search-box">
            <Search size={14} />
            <input placeholder="Search item" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <button type="button" className="btn outline square" onClick={() => setScanning(true)} title="Scan barcode"><ScanLine size={16} /></button>
        </div>
        <select value={itemId} onChange={(e) => { setItemId(e.target.value); setUnit("piece"); }}>
          {filteredItems.map((i) => (
            <option key={i.id} value={i.id}>{i.name} — {fmtMoney(i.sellPrice)} ({i.stock} left)</option>
          ))}
        </select>
        {scanMiss && <em className="field-hint">{scanMiss}</em>}
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

      {notEnough && (
        <div className="notice"><AlertTriangle size={15} /><span>Only {item.stock} pieces left. Recording this will take the count to zero.</span></div>
      )}

      <CustomerPicker data={data} credit={credit} setCredit={setCredit} customerId={customerId} setCustomerId={setCustomerId} />

      <div className="totals">
        <div><span>Customer pays</span><b>{fmtMoney(total)}</b></div>
        <div><span>You keep</span><b className="good">{fmtMoney(profit)}</b></div>
      </div>

      <button
        className="btn primary block"
        disabled={credit && !customerId}
        onClick={() => onSubmit({ itemId, qty, unit: isBox ? "box" : "piece", credit, customerId: credit ? customerId : null })}
      >
        <Check size={16} /> Record sale
      </button>

      {scanning && <ScannerModal title="Scan to sell" onClose={() => setScanning(false)} onDetect={handleScan} />}
    </Modal>
  );
}

/* ---------------- Khata ---------------- */

function Khata({ data, persist, showToast }) {
  const [openId, setOpenId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [showClosed, setShowClosed] = useState(false);

  const active = data.customers.filter((c) => c.status !== "closed").sort((a, b) => b.balance - a.balance);
  const closed = data.customers.filter((c) => c.status === "closed");
  const totalOwed = active.reduce((a, c) => a + Math.max(0, c.balance), 0);

  function addCustomer({ name, phone }) {
    const c = { id: uid(), name, phone, balance: 0, history: [], status: "active", createdAt: todayStr() };
    persist({ ...data, customers: [...data.customers, c] });
    setAdding(false);
    showToast("Customer added");
  }

  function updateCustomer(updated) {
    persist({ ...data, customers: data.customers.map((c) => (c.id === updated.id ? updated : c)) });
  }

  function closeAccount(customer) {
    updateCustomer({ ...customer, status: "closed", closedAt: todayStr() });
    setOpenId(null);
    showToast("Account closed. The record is kept.");
  }

  function reopenAccount(customer) {
    updateCustomer({ ...customer, status: "active", closedAt: null });
    showToast("Account reopened");
  }

  function deleteForever(id) {
    persist({ ...data, customers: data.customers.filter((c) => c.id !== id) });
    setOpenId(null);
    showToast("Customer deleted");
  }

  const activeCustomer = openId ? data.customers.find((c) => c.id === openId) : null;

  if (activeCustomer) {
    return (
      <CustomerDetail
        customer={activeCustomer}
        onBack={() => setOpenId(null)}
        onUpdate={updateCustomer}
        onClose={closeAccount}
        onReopen={reopenAccount}
        onDelete={deleteForever}
        showToast={showToast}
      />
    );
  }

  return (
    <div className="pane">
      <div className="stat-row">
        <Stat label="Owed to the shop" value={fmtMoney(totalOwed)} tone="due" />
        <Stat label="On the khata" value={active.length} />
      </div>

      <SectionLabel action={<button className="btn primary small" onClick={() => setAdding(true)}><Plus size={14} /> Customer</button>}>
        Credit accounts
      </SectionLabel>

      <div className="card list">
        {active.length === 0 && <EmptyState>Nobody on the khata yet. Add a customer who takes goods on credit.</EmptyState>}
        {active.map((c) => (
          <Row key={c.id} onClick={() => setOpenId(c.id)}>
            <div className="row-main">
              <div className="row-title">{c.name}</div>
              <div className="row-sub">{c.phone || "no phone"} · {c.history.length} entries</div>
            </div>
            <div className="row-end horizontal">
              <div className={`row-amt ${c.balance > 0 ? "due" : "good"}`}>{fmtMoney(c.balance)}</div>
              <ChevronRight size={16} color="var(--ink-soft)" />
            </div>
          </Row>
        ))}
      </div>

      {closed.length > 0 && (
        <>
          <button className="btn text" onClick={() => setShowClosed((v) => !v)}>
            <Archive size={14} /> {showClosed ? "Hide" : "Show"} closed accounts ({closed.length})
          </button>
          {showClosed && (
            <div className="card list">
              {closed.map((c) => (
                <Row key={c.id} onClick={() => setOpenId(c.id)}>
                  <div className="row-main">
                    <div className="row-title">{c.name}</div>
                    <div className="row-sub">Closed {c.closedAt ? fmtDate(c.closedAt) : ""} · {c.history.length} entries kept</div>
                  </div>
                  <ChevronRight size={16} color="var(--ink-soft)" />
                </Row>
              ))}
            </div>
          )}
        </>
      )}

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
    <div className="stack">
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ahmed bhai" autoFocus />
      </Field>
      <Field label="Phone (optional)">
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03xx-xxxxxxx" inputMode="tel" />
      </Field>
      <button className="btn primary block" onClick={() => name.trim() && onAdd({ name: name.trim(), phone: phone.trim() })}>
        <Check size={16} /> Add customer
      </button>
    </div>
  );
}

function CustomerDetail({ customer, onBack, onUpdate, onClose, onReopen, onDelete, showToast }) {
  const [entry, setEntry] = useState(null);       // "borrow" | "payment"
  const [leaving, setLeaving] = useState(false);
  const isClosed = customer.status === "closed";

  function addEntry(kind, amount, note) {
    const amt = Number(amount);
    if (!amt) return;
    const e = {
      id: uid(), kind, amount: amt, note: note?.trim() || "",
      date: todayStr(), createdAt: new Date().toISOString(),
    };
    const balance = customer.balance + (kind === "borrow" ? amt : -amt);
    onUpdate({ ...customer, balance, history: [e, ...customer.history] });
    setEntry(null);
    showToast(kind === "borrow" ? "Goods taken recorded" : "Payment recorded");
  }

  function removeEntry(id) {
    const e = customer.history.find((h) => h.id === id);
    if (!e) return;
    const balance = customer.balance - (e.kind === "borrow" ? e.amount : -e.amount);
    onUpdate({ ...customer, balance, history: customer.history.filter((h) => h.id !== id) });
    showToast("Entry removed");
  }

  // group history by date so borrowed things read as a dated list
  const grouped = useMemo(() => {
    const map = new Map();
    [...customer.history]
      .sort((a, b) => ((a.createdAt || a.date) < (b.createdAt || b.date) ? 1 : -1))
      .forEach((h) => {
        if (!map.has(h.date)) map.set(h.date, []);
        map.get(h.date).push(h);
      });
    return [...map.entries()];
  }, [customer.history]);

  const borrowedTotal = customer.history.filter((h) => h.kind === "borrow").reduce((a, h) => a + h.amount, 0);
  const paidTotal = customer.history.filter((h) => h.kind === "payment").reduce((a, h) => a + h.amount, 0);

  return (
    <div className="pane">
      <button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Khata</button>

      <div className="customer-head">
        <div>
          <h2>{customer.name}{isClosed && <span className="tag">closed</span>}</h2>
          {customer.phone && <div className="row-sub"><Phone size={12} /> {customer.phone}</div>}
          <div className="row-sub">On the khata since {fmtDate(customer.createdAt)}</div>
        </div>
        <div className={`balance ${customer.balance > 0 ? "due" : "good"}`}>
          {fmtMoney(customer.balance)}
          <span>{customer.balance > 0 ? "still owed" : "settled"}</span>
        </div>
      </div>

      <div className="stat-row">
        <Stat label="Taken in total" value={fmtMoney(borrowedTotal)} />
        <Stat label="Paid back" value={fmtMoney(paidTotal)} tone="good" />
      </div>

      {!isClosed && (
        <div className="btn-pair">
          <button className="btn outline block" onClick={() => setEntry("borrow")}>Goods taken</button>
          <button className="btn primary block" onClick={() => setEntry("payment")}>Payment received</button>
        </div>
      )}

      <SectionLabel>Everything taken, by date</SectionLabel>
      <div className="card list">
        {grouped.length === 0 && <EmptyState>Nothing recorded on this account yet.</EmptyState>}
        {grouped.map(([date, entries]) => (
          <div key={date}>
            <div className="date-head">{fmtDate(date)}</div>
            {entries.map((h) => (
              <Row key={h.id}>
                <div className="row-main">
                  <div className="row-title">{h.kind === "borrow" ? (h.note || "Goods taken") : "Payment"}</div>
                  <div className="row-sub">{h.kind === "borrow" ? "on credit" : "cash received"}</div>
                </div>
                <div className="row-end horizontal">
                  <div className={`row-amt ${h.kind === "borrow" ? "due" : "good"}`}>
                    {h.kind === "borrow" ? "+" : "−"}{fmtMoney(h.amount)}
                  </div>
                  <button className="icon-btn" onClick={() => removeEntry(h.id)} title="Remove entry"><X size={14} /></button>
                </div>
              </Row>
            ))}
          </div>
        ))}
      </div>

      {isClosed ? (
        <div className="stack">
          <button className="btn outline block" onClick={() => onReopen(customer)}><Undo2 size={15} /> Reopen this account</button>
          <button className="btn text" onClick={() => setLeaving(true)}><Trash2 size={14} /> Delete permanently</button>
        </div>
      ) : (
        <button className="btn text" onClick={() => setLeaving(true)}><Trash2 size={14} /> This customer has left the shop</button>
      )}

      {leaving && (
        <Modal title="Customer leaving" onClose={() => setLeaving(false)}>
          {customer.balance > 0 && (
            <div className="notice"><AlertTriangle size={15} /><span>{customer.name} still owes {fmtMoney(customer.balance)}.</span></div>
          )}
          <p className="body-text">
            Closing the account hides {customer.name} from the khata list but keeps every dated entry, so you can look
            the record up later. Deleting wipes the whole history and cannot be undone.
          </p>
          <div className="stack">
            {!isClosed && (
              <button className="btn primary block" onClick={() => { setLeaving(false); onClose(customer); }}>
                <Archive size={16} /> Close account, keep the record
              </button>
            )}
            <button className="btn danger block" onClick={() => { setLeaving(false); onDelete(customer.id); }}>
              <Trash2 size={16} /> Delete everything
            </button>
          </div>
        </Modal>
      )}

      {entry && (
        <Modal title={entry === "borrow" ? "Goods taken on credit" : "Payment received"} onClose={() => setEntry(null)}>
          <EntryForm kind={entry} onSubmit={(amt, note) => addEntry(entry, amt, note)} />
        </Modal>
      )}
    </div>
  );
}

function EntryForm({ kind, onSubmit }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  return (
    <div className="stack">
      <Field label="Amount">
        <input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" autoFocus />
      </Field>
      <Field label={kind === "borrow" ? "What was taken" : "Note (optional)"}>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={kind === "borrow" ? "2 notebooks, 1 packet chips" : "cash in hand"}
        />
      </Field>
      <button className="btn primary block" onClick={() => onSubmit(amount, note)}><Check size={16} /> Save</button>
    </div>
  );
}

/* ---------------- More: bills, suggestions, partners ---------------- */

function More(props) {
  const [view, setView] = useState(null);

  if (view === "bills") return <Bills {...props} onBack={() => setView(null)} />;
  if (view === "suggestions") return <Suggestions {...props} onBack={() => setView(null)} />;
  if (view === "partners") return <Partners {...props} onBack={() => setView(null)} />;

  const { data } = props;
  const unpaid = data.bills.filter((b) => !b.paid).length;
  const newSug = data.suggestions.filter((s) => s.status === "new").length;

  return (
    <div className="pane">
      <div className="card list">
        <Row onClick={() => setView("bills")}>
          <div className="row-icon" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}><Receipt size={18} /></div>
          <div className="row-main">
            <div className="row-title">Purchase bills</div>
            <div className="row-sub">Bills from the market, with photos{unpaid ? ` · ${unpaid} unpaid` : ""}</div>
          </div>
          <ChevronRight size={16} color="var(--ink-soft)" />
        </Row>
        <Row onClick={() => setView("suggestions")}>
          <div className="row-icon" style={{ background: "var(--brand-soft)", color: "var(--brand)" }}><MessageSquare size={18} /></div>
          <div className="row-main">
            <div className="row-title">Customer suggestions</div>
            <div className="row-sub">What people ask you to keep{newSug ? ` · ${newSug} new` : ""}</div>
          </div>
          <ChevronRight size={16} color="var(--ink-soft)" />
        </Row>
        <Row onClick={() => setView("partners")}>
          <div className="row-icon" style={{ background: "var(--good-soft)", color: "var(--good)" }}><Users size={18} /></div>
          <div className="row-main">
            <div className="row-title">Partners &amp; stock fund</div>
            <div className="row-sub">Profit split, and money set aside for new stock</div>
          </div>
          <ChevronRight size={16} color="var(--ink-soft)" />
        </Row>
      </div>

      <p className="fine-print">
        Everything is saved on this phone only. Nothing is sent anywhere, and clearing your browser data will clear the shop
        record with it.
      </p>
    </div>
  );
}

/* ---------------- Purchase bills ---------------- */

function Bills({ data, persist, showToast, onBack }) {
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [filter, setFilter] = useState("all");

  const bills = [...data.bills].sort((a, b) => (a.date < b.date ? 1 : -1));
  const shown = bills.filter((b) => filter === "all" || (filter === "unpaid" ? !b.paid : b.paid));
  const unpaidTotal = bills.filter((b) => !b.paid).reduce((a, b) => a + b.amount, 0);
  const monthTotal = bills
    .filter((b) => b.date.slice(0, 7) === todayStr().slice(0, 7))
    .reduce((a, b) => a + b.amount, 0);

  function saveBill(bill) {
    persist({ ...data, bills: [...data.bills, bill] });
    setAdding(false);
    showToast("Bill saved");
  }

  function togglePaid(bill) {
    persist({ ...data, bills: data.bills.map((b) => (b.id === bill.id ? { ...b, paid: !b.paid } : b)) });
  }

  function removeBill(id) {
    persist({ ...data, bills: data.bills.filter((b) => b.id !== id) });
    setViewing(null);
    showToast("Bill deleted");
  }

  return (
    <div className="pane">
      <button className="back-link" onClick={onBack}><ArrowLeft size={15} /> More</button>

      <div className="stat-row">
        <Stat label="Bought this month" value={fmtMoney(monthTotal)} />
        <Stat label="Still to pay" value={fmtMoney(unpaidTotal)} tone="warn" />
      </div>

      <button className="btn primary block" onClick={() => setAdding(true)}><Plus size={16} /> Add a bill</button>

      <div className="chip-row">
        {[["all", "All"], ["unpaid", "Unpaid"], ["paid", "Paid"]].map(([k, label]) => (
          <button key={k} className={`chip ${filter === k ? "active" : ""}`} onClick={() => setFilter(k)}>{label}</button>
        ))}
      </div>

      <div className="card list">
        {shown.length === 0 && (
          <EmptyState>No bills here yet. Photograph a bill the day you buy stock and it stays with the date.</EmptyState>
        )}
        {shown.map((b) => (
          <Row key={b.id} onClick={() => setViewing(b)}>
            {b.photo ? <img className="bill-thumb" src={b.photo} alt="" /> : <div className="row-icon"><FileText size={18} /></div>}
            <div className="row-main">
              <div className="row-title">{b.supplier}</div>
              <div className="row-sub">{fmtDate(b.date)}{b.note ? ` · ${b.note}` : ""}</div>
            </div>
            <div className="row-end">
              <div className="row-amt">{fmtMoney(b.amount)}</div>
              <div className={`row-sub ${b.paid ? "good" : "warn"}`}>{b.paid ? "paid" : "unpaid"}</div>
            </div>
          </Row>
        ))}
      </div>

      {adding && <BillModal data={data} onClose={() => setAdding(false)} onSave={saveBill} />}

      {viewing && (
        <Modal title={viewing.supplier} onClose={() => setViewing(null)}>
          {viewing.photo && <img className="bill-full" src={viewing.photo} alt="Bill" />}
          <div className="totals">
            <div><span>Amount</span><b>{fmtMoney(viewing.amount)}</b></div>
            <div><span>Date</span><b>{fmtDate(viewing.date)}</b></div>
            <div><span>Status</span><b className={viewing.paid ? "good" : "warn"}>{viewing.paid ? "Paid" : "Unpaid"}</b></div>
            {viewing.fromStockFund && <div><span>Paid from</span><b>Stock fund</b></div>}
          </div>
          {viewing.note && <p className="body-text">{viewing.note}</p>}
          <button className="btn outline block" onClick={() => { togglePaid(viewing); setViewing({ ...viewing, paid: !viewing.paid }); }}>
            Mark as {viewing.paid ? "unpaid" : "paid"}
          </button>
          <button className="btn text" onClick={() => removeBill(viewing.id)}><Trash2 size={14} /> Delete this bill</button>
        </Modal>
      )}
    </div>
  );
}

function BillModal({ data, onClose, onSave }) {
  const [supplier, setSupplier] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [paid, setPaid] = useState(true);
  const [fromStockFund, setFromStockFund] = useState(true);
  const [photo, setPhoto] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const suppliers = [...new Set(data.bills.map((b) => b.supplier))].slice(0, 6);

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      setPhoto(await compressImage(file));
    } catch (err) { /* ignore */ }
    setBusy(false);
  }

  return (
    <Modal title="New purchase bill" onClose={onClose}>
      <button type="button" className="photo-drop" onClick={() => fileRef.current?.click()}>
        {photo ? <img src={photo} alt="Bill" /> : (
          <>
            <ImageIcon size={22} />
            <strong>{busy ? "Saving the photo…" : "Photograph the bill"}</strong>
            <span>Or pick one from your gallery</span>
          </>
        )}
      </button>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFile} style={{ display: "none" }} />

      <Field label="Shop or company">
        <input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Raja Bazar wholesale" />
      </Field>
      {suppliers.length > 0 && (
        <div className="chip-row">
          {suppliers.map((s) => (
            <button key={s} type="button" className="chip" onClick={() => setSupplier(s)}>{s}</button>
          ))}
        </div>
      )}

      <div className="field-grid">
        <Field label="Bill amount">
          <input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
        </Field>
        <Field label="Date on the bill">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>

      <Field label="What was bought (optional)">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Chips cartons, A4 reams" />
      </Field>

      <label className="check-row">
        <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
        <span>Already paid</span>
      </label>
      <label className="check-row">
        <input type="checkbox" checked={fromStockFund} onChange={(e) => setFromStockFund(e.target.checked)} />
        <span>Paid out of the stock fund, not from a partner&apos;s pocket</span>
      </label>

      <button
        className="btn primary block"
        disabled={!supplier.trim() || !amount}
        onClick={() => onSave({
          id: uid(), supplier: supplier.trim(), amount: Number(amount), date,
          note: note.trim(), paid, fromStockFund, photo, createdAt: new Date().toISOString(),
        })}
      >
        <Check size={16} /> Save bill
      </button>
    </Modal>
  );
}

/* ---------------- Customer suggestions ---------------- */

function Suggestions({ data, persist, showToast, onBack }) {
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState("new");

  const list = [...data.suggestions].sort((a, b) => (a.date < b.date ? 1 : -1));
  const shown = list.filter((s) => filter === "all" || s.status === filter);

  function add(s) {
    persist({ ...data, suggestions: [{ ...s, id: uid(), date: todayStr(), status: "new" }, ...data.suggestions] });
    setAdding(false);
    showToast("Suggestion saved");
  }

  function setStatus(id, status) {
    persist({ ...data, suggestions: data.suggestions.map((s) => (s.id === id ? { ...s, status } : s)) });
  }

  function remove(id) {
    persist({ ...data, suggestions: data.suggestions.filter((s) => s.id !== id) });
    showToast("Suggestion removed");
  }

  return (
    <div className="pane">
      <button className="back-link" onClick={onBack}><ArrowLeft size={15} /> More</button>

      <div className="hero-note">
        <Lightbulb size={18} />
        <p>When someone asks for something you do not keep, write it here. The list tells you what to buy next.</p>
      </div>

      <button className="btn primary block" onClick={() => setAdding(true)}><Plus size={16} /> Add a suggestion</button>

      <div className="chip-row">
        {[["new", "To look at"], ["stocking", "Will stock"], ["done", "Done"], ["all", "All"]].map(([k, label]) => (
          <button key={k} className={`chip ${filter === k ? "active" : ""}`} onClick={() => setFilter(k)}>{label}</button>
        ))}
      </div>

      <div className="card list">
        {shown.length === 0 && <EmptyState>Nothing in this list.</EmptyState>}
        {shown.map((s) => (
          <div className="suggestion" key={s.id}>
            <div className="row-main">
              <div className="row-title">{s.text}</div>
              <div className="row-sub">{s.from ? `${s.from} · ` : ""}{fmtDate(s.date)}</div>
            </div>
            <div className="chip-row">
              <button className={`chip ${s.status === "new" ? "active" : ""}`} onClick={() => setStatus(s.id, "new")}>To look at</button>
              <button className={`chip ${s.status === "stocking" ? "active" : ""}`} onClick={() => setStatus(s.id, "stocking")}>Will stock</button>
              <button className={`chip ${s.status === "done" ? "active" : ""}`} onClick={() => setStatus(s.id, "done")}>Done</button>
              <button className="chip danger" onClick={() => remove(s.id)}><Trash2 size={13} /></button>
            </div>
          </div>
        ))}
      </div>

      {adding && (
        <Modal title="Customer suggestion" onClose={() => setAdding(false)}>
          <SuggestionForm onAdd={add} />
        </Modal>
      )}
    </div>
  );
}

function SuggestionForm({ onAdd }) {
  const [text, setText] = useState("");
  const [from, setFrom] = useState("");
  return (
    <div className="stack">
      <Field label="What did they ask for">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Keep A4 registers and glue sticks" autoFocus />
      </Field>
      <Field label="Who asked (optional)">
        <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Girl from the college" />
      </Field>
      <button className="btn primary block" onClick={() => text.trim() && onAdd({ text: text.trim(), from: from.trim() })}>
        <Check size={16} /> Save suggestion
      </button>
    </div>
  );
}

/* ---------------- Partners & stock fund ---------------- */

function Partners({ data, persist, showToast, onBack }) {
  const { settings } = data;
  const [editingNames, setEditingNames] = useState(false);
  const [editingSplit, setEditingSplit] = useState(false);
  const [withdrawFor, setWithdrawFor] = useState(null);

  const totalProfit = data.sales.reduce((a, s) => a + s.profit, 0);
  const pct = Number(settings.reinvestPct) || 0;

  const fundEarned = totalProfit * (pct / 100);
  const fundSpent = data.bills.filter((b) => b.fromStockFund).reduce((a, b) => a + b.amount, 0);
  const fundLeft = fundEarned - fundSpent;

  const distributable = totalProfit - fundEarned;
  const share = distributable / 2;

  const withdrawn = (n) => settings.withdrawals.filter((w) => w.partner === n).reduce((a, w) => a + w.amount, 0);

  function saveNames(p1, p2) {
    persist({ ...data, settings: { ...settings, partner1: p1, partner2: p2 } });
    setEditingNames(false);
  }

  function saveSplit(newPct) {
    persist({ ...data, settings: { ...settings, reinvestPct: newPct } });
    setEditingSplit(false);
    showToast("Stock share updated");
  }

  function addWithdrawal(partner, amount, note) {
    const amt = Number(amount);
    if (!amt) return;
    const w = { id: uid(), partner, amount: amt, note: note?.trim() || "", date: todayStr() };
    persist({ ...data, settings: { ...settings, withdrawals: [w, ...settings.withdrawals] } });
    setWithdrawFor(null);
    showToast("Withdrawal recorded");
  }

  const recent = [...settings.withdrawals].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 10);

  return (
    <div className="pane">
      <button className="back-link" onClick={onBack}><ArrowLeft size={15} /> More</button>

      <div className="fund-card">
        <div className="fund-head">
          <PiggyBank size={20} />
          <div>
            <div className="fund-label">Kept back for new stock</div>
            <div className="fund-value">{fmtMoney(fundLeft)}</div>
          </div>
        </div>
        <div className="fund-bar">
          <div className="fund-fill" style={{ width: `${fundEarned > 0 ? Math.min(100, (fundSpent / fundEarned) * 100) : 0}%` }} />
        </div>
        <div className="fund-legend">
          <span>{fmtMoney(fundSpent)} spent on bills</span>
          <span>{fmtMoney(fundEarned)} set aside so far</span>
        </div>
        <p className="fund-note">
          {pct}% of every rupee of profit stays in the shop to buy new stock. Partners divide what is left.
          Bills marked as paid from the stock fund come out of this amount.
        </p>
        <button className="btn ghost small" onClick={() => setEditingSplit(true)}><Pencil size={13} /> Change the {pct}%</button>
      </div>

      <div className="stat-row">
        <Stat label="Profit earned" value={fmtMoney(totalProfit)} tone="good" />
        <Stat label="To divide" value={fmtMoney(distributable)} />
      </div>

      <SectionLabel action={<button className="btn ghost small" onClick={() => setEditingNames(true)}><Pencil size={13} /> Names</button>}>
        Each partner
      </SectionLabel>

      <div className="partner-grid">
        {[1, 2].map((n) => (
          <div className="partner-card" key={n}>
            <div className="partner-name">{n === 1 ? settings.partner1 : settings.partner2}</div>
            <div className="partner-share">{fmtMoney(share)}</div>
            <div className="row-sub">half of the divisible profit</div>
            <div className="partner-left">
              <span>Taken</span><b>{fmtMoney(withdrawn(n))}</b>
            </div>
            <div className="partner-left">
              <span>Left to take</span><b className="good">{fmtMoney(share - withdrawn(n))}</b>
            </div>
            <button className="btn outline block small" onClick={() => setWithdrawFor(n)}><Wallet size={14} /> Withdraw</button>
          </div>
        ))}
      </div>

      <SectionLabel>Withdrawals</SectionLabel>
      <div className="card list">
        {recent.length === 0 && <EmptyState>No money taken out yet.</EmptyState>}
        {recent.map((w) => (
          <Row key={w.id}>
            <div className="row-main">
              <div className="row-title">{w.partner === 1 ? settings.partner1 : settings.partner2}{w.note ? ` — ${w.note}` : ""}</div>
              <div className="row-sub">{fmtDate(w.date)}</div>
            </div>
            <div className="row-amt due">−{fmtMoney(w.amount)}</div>
          </Row>
        ))}
      </div>

      {editingNames && (
        <Modal title="Partner names" onClose={() => setEditingNames(false)}>
          <NameForm p1={settings.partner1} p2={settings.partner2} onSave={saveNames} />
        </Modal>
      )}

      {editingSplit && (
        <Modal title="Share kept for stock" onClose={() => setEditingSplit(false)}>
          <SplitForm pct={pct} totalProfit={totalProfit} onSave={saveSplit} />
        </Modal>
      )}

      {withdrawFor && (
        <Modal title={`${withdrawFor === 1 ? settings.partner1 : settings.partner2} is taking money out`} onClose={() => setWithdrawFor(null)}>
          <EntryForm kind="payment" onSubmit={(amt, note) => addWithdrawal(withdrawFor, amt, note)} />
        </Modal>
      )}
    </div>
  );
}

function SplitForm({ pct, totalProfit, onSave }) {
  const [value, setValue] = useState(pct);
  const fund = totalProfit * (value / 100);
  const each = (totalProfit - fund) / 2;
  return (
    <div className="stack">
      <Field label={`Keep ${value}% of profit in the shop`}>
        <input type="range" min="0" max="80" step="5" value={value} onChange={(e) => setValue(Number(e.target.value))} />
      </Field>
      <div className="totals">
        <div><span>Stock fund</span><b>{fmtMoney(fund)}</b></div>
        <div><span>Each partner</span><b className="good">{fmtMoney(each)}</b></div>
      </div>
      <p className="fine-print">
        A higher share means slower payouts but a shop that can restock itself without either partner putting money in.
      </p>
      <button className="btn primary block" onClick={() => onSave(value)}><Check size={16} /> Save</button>
    </div>
  );
}

function NameForm({ p1, p2, onSave }) {
  const [a, setA] = useState(p1);
  const [b, setB] = useState(p2);
  return (
    <div className="stack">
      <Field label="First partner"><input value={a} onChange={(e) => setA(e.target.value)} /></Field>
      <Field label="Second partner"><input value={b} onChange={(e) => setB(e.target.value)} /></Field>
      <button className="btn primary block" onClick={() => onSave(a.trim() || "Partner 1", b.trim() || "Partner 2")}>
        <Check size={16} /> Save
      </button>
    </div>
  );
}

/* ---------------- Styles ---------------- */

function ShopStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');

      :root { color-scheme: light; }
      body { margin: 0; background: #E7EDF3; }

      .shop-app {
        --bg: #F2F6FA;
        --surface: #FFFFFF;
        --surface-2: #F6F9FC;
        --line: #E1E8EF;
        --ink: #13232F;
        --ink-soft: #6B7F90;

        --brand: #0E7490;
        --brand-deep: #0B5C74;
        --brand-soft: #E2F1F6;

        --good: #12795B;
        --good-soft: #E1F3EC;
        --due: #BE3455;
        --warn: #A8681B;
        --warn-soft: #FAEEDC;

        --snacks: #C2661A;
        --stationery: #4257B2;
        --printing: #0E7490;

        font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
        color: var(--ink);
        background: var(--bg);
        max-width: 470px;
        margin: 0 auto;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 0 60px rgba(19,35,47,0.08);
      }

      .shop-app *:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; border-radius: 6px; }
      @media (prefers-reduced-motion: reduce) { .shop-app * { transition: none !important; animation: none !important; } }

      .loading-screen { padding: 48px 20px; color: var(--ink-soft); }

      /* header */
      .app-header {
        background: linear-gradient(160deg, var(--brand-deep), var(--brand));
        color: #fff;
        padding: 16px 16px 18px;
        display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;
      }
      .brand { display: flex; gap: 11px; align-items: center; }
      .brand-mark {
        width: 38px; height: 38px; border-radius: 11px; flex-shrink: 0;
        background: rgba(255,255,255,0.16); border: 1px solid rgba(255,255,255,0.28);
        display: flex; align-items: center; justify-content: center;
        font-weight: 700; font-size: 14px; letter-spacing: 0.5px;
      }
      .app-header h1 { font-size: 17px; margin: 0; font-weight: 700; letter-spacing: -0.2px; }
      .brand-sub { font-size: 11px; opacity: 0.82; margin-top: 2px; }
      .header-today { text-align: right; }
      .header-today-label { font-size: 10px; opacity: 0.8; }
      .header-today-value { font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; }

      .content { flex: 1; overflow-y: auto; padding: 14px 14px 96px; }
      .pane { display: flex; flex-direction: column; gap: 14px; }
      .stack { display: flex; flex-direction: column; gap: 12px; }

      .section-label {
        display: flex; align-items: center; justify-content: space-between; gap: 10px;
        font-size: 12px; font-weight: 600; color: var(--ink-soft); margin-top: 2px;
      }

      .card {
        background: var(--surface); border: 1px solid var(--line);
        border-radius: 14px; overflow: hidden;
      }
      .chart-card { padding: 12px 6px 6px; }

      /* today card */
      .today-card {
        background: var(--surface); border: 1px solid var(--line); border-radius: 16px;
        padding: 16px 16px 6px;
      }
      .today-label { font-size: 12px; color: var(--ink-soft); font-weight: 600; }
      .today-value { font-size: 34px; font-weight: 700; letter-spacing: -1px; font-variant-numeric: tabular-nums; line-height: 1.15; }
      .today-profit { font-size: 12px; color: var(--good); font-weight: 600; margin-top: 2px; }
      .dept-bar { display: flex; margin-top: 14px; border-top: 1px solid var(--line); }
      .dept-cell { flex: 1; padding: 11px 4px; text-align: center; }
      .dept-cell + .dept-cell { border-left: 1px solid var(--line); }
      .dept-amt { font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; margin-top: 3px; }
      .dept-name { font-size: 10px; color: var(--ink-soft); margin-top: 1px; }

      .stat-row { display: flex; gap: 8px; }
      .stat {
        flex: 1; background: var(--surface); border: 1px solid var(--line);
        border-radius: 12px; padding: 11px 9px;
      }
      .stat-value { font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; }
      .stat-label { font-size: 10.5px; color: var(--ink-soft); margin-top: 2px; }

      /* rows */
      .list > * + * { border-top: 1px solid var(--line); }
      .row {
        display: flex; align-items: center; gap: 11px;
        padding: 12px 13px; background: var(--surface);
      }
      .row.clickable { cursor: pointer; }
      .row.clickable:active { background: var(--surface-2); }
      .row-main { flex: 1; min-width: 0; }
      .row-title { font-size: 14px; font-weight: 600; line-height: 1.3; }
      .row-sub { font-size: 11.5px; color: var(--ink-soft); margin-top: 2px; display: flex; align-items: center; gap: 4px; }
      .row-amt { font-size: 13.5px; font-weight: 700; white-space: nowrap; font-variant-numeric: tabular-nums; }
      .row-end { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
      .row-end.horizontal { flex-direction: row; align-items: center; gap: 6px; }
      .row-icon {
        width: 38px; height: 38px; border-radius: 11px; flex-shrink: 0;
        background: var(--surface-2); color: var(--ink-soft);
        display: flex; align-items: center; justify-content: center;
      }
      .good { color: var(--good); }
      .due { color: var(--due); }
      .warn { color: var(--warn); }

      .date-head {
        font-size: 11px; font-weight: 700; color: var(--ink-soft);
        padding: 8px 13px 4px; background: var(--surface-2);
      }

      .empty-state { padding: 22px 14px; font-size: 13px; color: var(--ink-soft); line-height: 1.55; }
      .body-text { font-size: 13px; color: var(--ink-soft); line-height: 1.6; margin: 0; }
      .fine-print { font-size: 11.5px; color: var(--ink-soft); line-height: 1.6; margin: 0; }
      .field-hint { font-size: 11px; color: var(--ink-soft); font-style: normal; }

      /* buttons */
      .btn {
        font-family: inherit; font-size: 13.5px; font-weight: 600;
        border-radius: 11px; padding: 11px 15px; cursor: pointer;
        display: inline-flex; align-items: center; justify-content: center; gap: 7px;
        border: 1px solid transparent; transition: background 120ms ease;
      }
      .btn.block { width: 100%; }
      .btn.small { padding: 7px 11px; font-size: 12px; border-radius: 9px; }
      .btn.square { padding: 11px; flex-shrink: 0; }
      .btn:disabled { opacity: 0.45; cursor: not-allowed; }
      .btn.primary { background: var(--brand); color: #fff; }
      .btn.primary:active:not(:disabled) { background: var(--brand-deep); }
      .btn.outline { background: var(--surface); border-color: var(--line); color: var(--ink); }
      .btn.ghost { background: var(--brand-soft); color: var(--brand-deep); }
      .btn.danger { background: var(--due); color: #fff; }
      .btn.text {
        background: none; border: none; color: var(--ink-soft); font-size: 12.5px;
        align-self: center; padding: 6px; text-decoration: underline;
      }
      .btn-pair { display: flex; gap: 8px; }
      .btn-pair > * { flex: 1; }
      .icon-btn { background: none; border: none; cursor: pointer; color: var(--ink-soft); padding: 4px; display: flex; }

      /* scan call to action */
      .scan-cta {
        width: 100%; text-align: left; font-family: inherit; cursor: pointer;
        display: flex; align-items: center; gap: 13px;
        padding: 15px 15px; border-radius: 14px;
        background: linear-gradient(160deg, var(--brand-deep), var(--brand));
        color: #fff; border: none;
      }
      .scan-cta strong { display: block; font-size: 14.5px; font-weight: 700; }
      .scan-cta span { display: block; font-size: 11.5px; opacity: 0.85; margin-top: 2px; line-height: 1.45; }

      .inline-row { display: flex; gap: 8px; align-items: center; }
      .inline-row > input, .inline-row > select { flex: 1; min-width: 0; }

      .search-box {
        flex: 1; display: flex; align-items: center; gap: 7px;
        background: var(--surface); border: 1px solid var(--line);
        border-radius: 11px; padding: 10px 12px; color: var(--ink-soft);
      }
      .search-box input { border: none; background: none; outline: none; flex: 1; min-width: 0; font-size: 13.5px; color: var(--ink); font-family: inherit; }

      .chip-row { display: flex; gap: 6px; flex-wrap: wrap; }
      .chip {
        border: 1px solid var(--line); background: var(--surface); font-family: inherit;
        border-radius: 999px; padding: 6px 12px; font-size: 12px; cursor: pointer; color: var(--ink-soft);
      }
      .chip.active { background: var(--brand); color: #fff; border-color: var(--brand); }
      .chip.danger { color: var(--due); border-color: var(--line); padding: 6px 10px; }

      /* tab bar */
      .tabbar {
        position: sticky; bottom: 0; display: flex; background: var(--surface);
        border-top: 1px solid var(--line); padding-bottom: env(safe-area-inset-bottom);
      }
      .tab-btn {
        flex: 1; background: none; border: none; padding: 9px 2px 11px;
        display: flex; flex-direction: column; align-items: center; gap: 4px;
        color: var(--ink-soft); font-size: 10px; cursor: pointer; font-family: inherit; font-weight: 600;
      }
      .tab-btn.active { color: var(--brand); }

      /* modal */
      .modal-backdrop {
        position: fixed; inset: 0; background: rgba(19,35,47,0.42);
        display: flex; align-items: flex-end; justify-content: center; z-index: 50;
      }
      .modal-sheet {
        background: var(--bg); width: 100%; max-width: 470px;
        border-radius: 20px 20px 0 0; max-height: 90vh; overflow-y: auto;
      }
      .modal-head {
        display: flex; justify-content: space-between; align-items: center;
        padding: 16px 17px 13px; font-weight: 700; font-size: 15px;
        border-bottom: 1px solid var(--line); position: sticky; top: 0; background: var(--bg); z-index: 2;
      }
      .modal-body { padding: 15px 15px 26px; display: flex; flex-direction: column; gap: 13px; }

      .field { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--ink-soft); font-weight: 600; }
      .field input, .field select, .modal-body input, .modal-body select {
        font-family: inherit; font-size: 14.5px; color: var(--ink); font-weight: 500;
        border: 1px solid var(--line); border-radius: 11px; padding: 11px 12px; background: var(--surface);
        width: 100%; box-sizing: border-box;
      }
      .field input[type="range"] { padding: 0; accent-color: var(--brand); }
      .field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .check-row { display: flex; align-items: flex-start; gap: 9px; font-size: 13px; line-height: 1.45; }
      .check-row input { width: 18px; height: 18px; flex-shrink: 0; margin-top: 1px; accent-color: var(--brand); }

      .totals {
        background: var(--surface); border: 1px solid var(--line); border-radius: 12px;
        padding: 12px 13px; display: flex; flex-direction: column; gap: 7px;
      }
      .totals > div { display: flex; justify-content: space-between; font-size: 13px; color: var(--ink-soft); }
      .totals b { color: var(--ink); font-variant-numeric: tabular-nums; }

      .notice {
        display: flex; gap: 9px; align-items: flex-start;
        background: var(--warn-soft); color: var(--warn);
        border-radius: 11px; padding: 11px 12px; font-size: 12.5px; line-height: 1.5;
      }
      .notice svg { flex-shrink: 0; margin-top: 1px; }

      .hero-note {
        display: flex; gap: 11px; align-items: flex-start;
        background: var(--brand-soft); color: var(--brand-deep);
        border-radius: 14px; padding: 14px;
      }
      .hero-note p { margin: 0; font-size: 13px; line-height: 1.55; }
      .hero-note svg { flex-shrink: 0; margin-top: 1px; }

      .danger-zone {
        background: var(--surface); border: 1px solid var(--due); border-radius: 12px;
        padding: 13px; display: flex; flex-direction: column; gap: 10px; font-size: 12.5px; color: var(--ink-soft);
      }
      .danger-zone .inline-row > * { flex: 1; }

      .matched-card {
        background: var(--good-soft); border-radius: 12px; padding: 13px;
      }
      .matched-name { font-weight: 700; font-size: 15px; }

      /* scanner */
      .scanner-wrap { position: relative; border-radius: 13px; overflow: hidden; background: #000; }
      .scanner-video { width: 100%; display: block; max-height: 260px; object-fit: cover; }
      .scanner-reticle { position: absolute; inset: 22% 12%; border: 2px solid rgba(255,255,255,0.9); border-radius: 10px; }
      .scanner-hint {
        position: absolute; left: 0; right: 0; bottom: 8px; text-align: center;
        color: #fff; font-size: 11.5px; text-shadow: 0 1px 3px rgba(0,0,0,0.6);
      }

      /* bills */
      .photo-drop {
        width: 100%; border: 1.5px dashed var(--line); background: var(--surface);
        border-radius: 14px; padding: 22px 14px; cursor: pointer; font-family: inherit;
        display: flex; flex-direction: column; align-items: center; gap: 5px; color: var(--ink-soft);
      }
      .photo-drop strong { font-size: 13.5px; color: var(--ink); }
      .photo-drop span { font-size: 11.5px; }
      .photo-drop img { width: 100%; border-radius: 10px; display: block; }
      .bill-thumb { width: 42px; height: 42px; object-fit: cover; border-radius: 9px; flex-shrink: 0; border: 1px solid var(--line); }
      .bill-full { width: 100%; border-radius: 12px; border: 1px solid var(--line); display: block; }

      /* suggestions */
      .suggestion { padding: 13px; display: flex; flex-direction: column; gap: 10px; background: var(--surface); }

      /* customer detail */
      .back-link {
        background: none; border: none; color: var(--ink-soft); font-size: 12.5px; font-family: inherit;
        display: flex; align-items: center; gap: 5px; cursor: pointer; padding: 0; align-self: flex-start; font-weight: 600;
      }
      .customer-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
      .customer-head h2 { font-size: 20px; margin: 0 0 3px; display: flex; align-items: center; gap: 8px; }
      .tag {
        font-size: 10px; font-weight: 600; background: var(--surface-2); color: var(--ink-soft);
        border: 1px solid var(--line); border-radius: 999px; padding: 2px 8px;
      }
      .balance { text-align: right; font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }
      .balance span { display: block; font-size: 10.5px; font-weight: 500; color: var(--ink-soft); }
      .balance.due { color: var(--due); }
      .balance.good { color: var(--good); }

      /* partners */
      .fund-card {
        background: var(--surface); border: 1px solid var(--line); border-radius: 16px;
        padding: 16px; display: flex; flex-direction: column; gap: 11px;
      }
      .fund-head { display: flex; gap: 12px; align-items: center; color: var(--brand); }
      .fund-label { font-size: 12px; color: var(--ink-soft); font-weight: 600; }
      .fund-value { font-size: 26px; font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums; letter-spacing: -0.5px; }
      .fund-bar { height: 7px; border-radius: 99px; background: var(--brand-soft); overflow: hidden; }
      .fund-fill { height: 100%; background: var(--brand); border-radius: 99px; }
      .fund-legend { display: flex; justify-content: space-between; font-size: 11px; color: var(--ink-soft); }
      .fund-note { margin: 0; font-size: 12px; color: var(--ink-soft); line-height: 1.6; }
      .fund-card .btn.ghost { align-self: flex-start; }

      .partner-grid { display: flex; gap: 9px; }
      .partner-card {
        flex: 1; background: var(--surface); border: 1px solid var(--line); border-radius: 14px;
        padding: 13px; display: flex; flex-direction: column; gap: 3px;
      }
      .partner-name { font-size: 12.5px; color: var(--ink-soft); font-weight: 600; }
      .partner-share { font-size: 19px; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -0.4px; }
      .partner-left { display: flex; justify-content: space-between; font-size: 11.5px; color: var(--ink-soft); margin-top: 3px; }
      .partner-left b { font-variant-numeric: tabular-nums; color: var(--ink); }
      .partner-card .btn { margin-top: 9px; }

      .toast {
        position: fixed; bottom: 86px; left: 50%; transform: translateX(-50%);
        background: var(--ink); color: #fff; padding: 10px 18px; border-radius: 999px;
        font-size: 12.5px; font-weight: 500; z-index: 60; max-width: 88%; text-align: center;
      }
    `}</style>
  );
}
