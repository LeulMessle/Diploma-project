import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// For Node 18+, fetch is global. If on older Node, install node-fetch and import it.
// import fetch from "node-fetch";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Allow preflight for all routes
app.options("*", cors());

// Simple logger for API routes
app.use((req, _res, next) => {
  if (req.path.startsWith("/api/")) {
    console.log(`[API] ${req.method} ${req.path}`);
  }
  next();
});

// Proxy: /api/search?q=term -> Infermedica /v3/search
app.get("/api/search", async (req, res) => {
  try {
    const q = req.query.q || "";
    const url = new URL("https://api.infermedica.com/v3/search");
    url.searchParams.set("phrase", q);
    const r = await fetch(url, {
      method: "GET",
      headers: {
        "App-Id": APP_ID,
        "App-Key": APP_KEY,
        "Model": MODEL,
        "Accept": "application/json"
      }
    });
    const text = await r.text();
    res.status(r.status).type("application/json").send(text);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// CORS: lock to your frontend origin in production
const allowedOrigin = process.env.CORS_ORIGIN || "http://localhost:3000";
app.use(cors({ origin: allowedOrigin }));

// Serve static frontend from /public
app.use(express.static(path.join(__dirname, "public")));

const APP_ID = process.env.INFERMEDICA_APP_ID;
const APP_KEY = process.env.INFERMEDICA_APP_KEY;
const MODEL  = process.env.INFERMEDICA_MODEL || "infermedica-en";

if (!APP_ID || !APP_KEY) {
  console.warn("[WARN] INFERMEDICA_APP_ID or INFERMEDICA_APP_KEY missing. Set them in .env");
}

app.get("/api/health", (_, res) => res.json({ ok: true }));

// Proxy: /api/parse -> Infermedica /v3/parse
app.post("/api/parse", async (req, res) => {
  try {
    const r = await fetch("https://api.infermedica.com/v3/parse", {
      method: "POST",
      headers: {
        "App-Id": APP_ID,
        "App-Key": APP_KEY,
        "Model": MODEL,
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: req.body.text || "",
        age: req.body.age,
        sex: req.body.sex,
      }),
    });
    const text = await r.text();
    res.status(r.status).type("application/json").send(text);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Proxy: /api/diagnosis -> Infermedica /v3/diagnosis
app.post("/api/diagnosis", async (req, res) => {
  try {
    const headers = {
      "App-Id": APP_ID,
      "App-Key": APP_KEY,
      "Model": MODEL,
      "Accept": "application/json",
      "Content-Type": "application/json",
    };
    if (req.headers["x-interview-id"]) {
      headers["Interview-Id"] = req.headers["x-interview-id"];
    }
    const body = JSON.stringify(req.body);
    const t0 = Date.now();
    const r = await fetch("https://api.infermedica.com/v3/diagnosis", {
      method: "POST",
      headers,
      body,
    });
    const text = await r.text();
    const t1 = Date.now();
    console.log("[diag] ms=%d reqB=%d resB=%d status=%d",
      t1 - t0, Buffer.byteLength(body), Buffer.byteLength(text), r.status);
    res.status(r.status).type("application/json").send(text);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/triage", async (req, res) => {
  try {
    const headers = {
      "App-Id": APP_ID,
      "App-Key": APP_KEY,
      "Model": MODEL,
      "Accept": "application/json",
      "Content-Type": "application/json",
    };
    if (req.headers["x-interview-id"]) {
      headers["Interview-Id"] = req.headers["x-interview-id"];
    }
    const body = JSON.stringify(req.body);
    const t0 = Date.now();
    const r = await fetch("https://api.infermedica.com/v3/triage", {
      method: "POST",
      headers,
      body
    });
    const text = await r.text();
    const t1 = Date.now();
    console.log("[triage] ms=%d reqB=%d resB=%d status=%d",
      t1 - t0, Buffer.byteLength(body), Buffer.byteLength(text), r.status);
    res.status(r.status).type("application/json").send(text);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== NEW: /api/info snapshot (call once, save JSON for your appendix) =====
app.get("/api/info", async (_req, res) => {
  try {
    const r = await fetch("https://api.infermedica.com/v3/info", {
      headers: {
        "App-Id": APP_ID,
        "App-Key": APP_KEY,
        "Model": MODEL,
        "Accept": "application/json",
      },
    });
    const text = await r.text();
    res.status(r.status).type("application/json").send(text);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  console.log("Open http://localhost:%s in your browser", port);
});
