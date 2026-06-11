"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { C, areaColor } from "../theme";

interface ApiNode {
  id: string;
  title: string;
  kind: string;
  area: string | null;
  degree: number;
}
interface ApiEdge {
  source: string;
  target: string;
  reason: string | null;
}
interface SimNode extends ApiNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fixed?: boolean;
}

export default function GraphClient() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "empty">(
    "loading",
  );
  const [msg, setMsg] = useState("");
  const router = useRouter();
  // ボタン操作用に view を ref で外に出す
  const ctrlRef = useRef<{
    zoom: (f: number) => void;
    rotate: (rad: number) => void;
    reset: () => void;
  } | null>(null);

  useEffect(() => {
    let raf = 0;
    let disposed = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const view = { scale: 1, offX: 0, offY: 0, rot: 0 };
    let nodes: SimNode[] = [];
    let edges: { s: SimNode; t: SimNode; reason: string | null }[] = [];
    let alpha = 1;
    let hover: SimNode | null = null;

    const W = () => canvas.clientWidth;
    const H = () => canvas.clientHeight;

    const worldToScreen = (x: number, y: number) => {
      const cos = Math.cos(view.rot);
      const sin = Math.sin(view.rot);
      const xr = x * cos - y * sin;
      const yr = x * sin + y * cos;
      return {
        x: W() / 2 + view.offX + xr * view.scale,
        y: H() / 2 + view.offY + yr * view.scale,
      };
    };
    const screenToWorld = (px: number, py: number) => {
      const cos = Math.cos(view.rot);
      const sin = Math.sin(view.rot);
      const dx = (px - (W() / 2 + view.offX)) / view.scale;
      const dy = (py - (H() / 2 + view.offY)) / view.scale;
      return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
    };
    // (px,py) の下のワールド点を保ったまま scale/rot を変更
    const applyAround = (px: number, py: number, scale: number, rot: number) => {
      const before = screenToWorld(px, py);
      view.scale = Math.min(5, Math.max(0.15, scale));
      view.rot = rot;
      const cos = Math.cos(view.rot);
      const sin = Math.sin(view.rot);
      const xr = before.x * cos - before.y * sin;
      const yr = before.x * sin + before.y * cos;
      view.offX = px - W() / 2 - xr * view.scale;
      view.offY = py - H() / 2 - yr * view.scale;
    };

    ctrlRef.current = {
      zoom: (f) => applyAround(W() / 2, H() / 2, view.scale * f, view.rot),
      rotate: (rad) => applyAround(W() / 2, H() / 2, view.scale, view.rot + rad),
      reset: () => {
        view.scale = 1;
        view.offX = 0;
        view.offY = 0;
        view.rot = 0;
      },
    };

    const run = async () => {
      let data: { nodes: ApiNode[]; edges: ApiEdge[] };
      try {
        const res = await fetch("/api/graph", { cache: "no-store" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        data = await res.json();
      } catch (e) {
        if (!disposed) {
          setStatus("error");
          setMsg(e instanceof Error ? e.message : String(e));
        }
        return;
      }
      if (disposed) return;
      if (!data.nodes || data.nodes.length === 0) {
        setStatus("empty");
        return;
      }
      const byId = new Map<string, SimNode>();
      const R = Math.min(380, 30 + data.nodes.length * 3);
      nodes = data.nodes.map((n, i) => {
        const a = (i / data.nodes.length) * Math.PI * 2;
        const sn: SimNode = {
          ...n,
          x: Math.cos(a) * R * (0.4 + Math.random() * 0.6),
          y: Math.sin(a) * R * (0.4 + Math.random() * 0.6),
          vx: 0,
          vy: 0,
        };
        byId.set(n.id, sn);
        return sn;
      });
      edges = data.edges
        .map((e) => ({ s: byId.get(e.source)!, t: byId.get(e.target)!, reason: e.reason }))
        .filter((e) => e.s && e.t);
      setStatus("ready");
      loop();
    };

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const radiusOf = (n: SimNode) => 4 + Math.min(10, Math.sqrt(n.degree) * 2.6);

    const step = () => {
      const SPRING_L = 70;
      const REP = 1600;
      const CENTER = 0.012;
      for (const n of nodes) {
        if (n.fixed) continue;
        let fx = -n.x * CENTER;
        let fy = -n.y * CENTER;
        for (const m of nodes) {
          if (m === n) continue;
          let dx = n.x - m.x;
          let dy = n.y - m.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 0.01) {
            d2 = 0.01;
            dx = Math.random() - 0.5;
            dy = Math.random() - 0.5;
          }
          const f = REP / d2;
          const d = Math.sqrt(d2);
          fx += (dx / d) * f;
          fy += (dy / d) * f;
        }
        n.vx = (n.vx + fx * alpha) * 0.85;
        n.vy = (n.vy + fy * alpha) * 0.85;
      }
      for (const e of edges) {
        const dx = e.t.x - e.s.x;
        const dy = e.t.y - e.s.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const f = (d - SPRING_L) * 0.04 * alpha;
        const ux = dx / d;
        const uy = dy / d;
        if (!e.s.fixed) {
          e.s.vx += ux * f * 8;
          e.s.vy += uy * f * 8;
        }
        if (!e.t.fixed) {
          e.t.vx -= ux * f * 8;
          e.t.vy -= uy * f * 8;
        }
      }
      for (const n of nodes) {
        if (n.fixed) continue;
        const sp = Math.hypot(n.vx, n.vy);
        if (sp > 30) {
          n.vx = (n.vx / sp) * 30;
          n.vy = (n.vy / sp) * 30;
        }
        n.x += n.vx;
        n.y += n.vy;
      }
      if (alpha > 0.03) alpha *= 0.994;
    };

    const draw = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, W(), H());
      const P = (n: SimNode) => worldToScreen(n.x, n.y);

      ctx.strokeStyle = "rgba(60,60,67,0.18)";
      ctx.lineWidth = 1;
      for (const e of edges) {
        const a = P(e.s);
        const b = P(e.t);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      for (const n of nodes) {
        const p = P(n);
        const r = radiusOf(n) * Math.min(1.4, Math.max(0.6, view.scale));
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = areaColor(n.area);
        ctx.fill();
        if (n === hover) {
          ctx.lineWidth = 2;
          ctx.strokeStyle = C.accent;
          ctx.stroke();
        }
      }
      const showLabels = view.scale > 0.55 || nodes.length <= 60;
      if (showLabels) {
        ctx.fillStyle = "#3a3a3c";
        ctx.font = "11px -apple-system, sans-serif";
        ctx.textAlign = "center";
        for (const n of nodes) {
          if (nodes.length > 80 && n.degree === 0 && n !== hover) continue;
          const p = P(n);
          const label = n.title.length > 14 ? n.title.slice(0, 14) + "…" : n.title;
          ctx.fillText(label, p.x, p.y + radiusOf(n) + 12);
        }
      }
    };

    const loop = () => {
      step();
      draw();
      raf = requestAnimationFrame(loop);
    };

    // ---- interaction ----
    const pick = (px: number, py: number): SimNode | null => {
      const w = screenToWorld(px, py);
      let best: SimNode | null = null;
      let bestD = 16 / view.scale;
      for (const n of nodes) {
        const d = Math.hypot(n.x - w.x, n.y - w.y);
        const rr = radiusOf(n) + 6;
        if (d < Math.max(bestD, rr)) {
          bestD = d;
          best = n;
        }
      }
      return best;
    };

    const pointers = new Map<number, { x: number; y: number }>();
    let dragNode: SimNode | null = null;
    let panning = false;
    let downX = 0,
      downY = 0,
      moved = 0,
      lastX = 0,
      lastY = 0;
    // two-pointer gesture state
    let gPrevDist = 0,
      gPrevAng = 0,
      gPrevMidX = 0,
      gPrevMidY = 0;

    const xy = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const onDown = (e: PointerEvent) => {
      const p = xy(e);
      pointers.set(e.pointerId, p);
      canvas.setPointerCapture(e.pointerId);
      if (pointers.size === 1) {
        downX = p.x;
        downY = p.y;
        moved = 0;
        lastX = p.x;
        lastY = p.y;
        const n = pick(p.x, p.y);
        if (n) {
          dragNode = n;
          n.fixed = true;
        } else {
          panning = true;
        }
      } else if (pointers.size === 2) {
        // start gesture; cancel single-pointer modes
        if (dragNode) dragNode.fixed = false;
        dragNode = null;
        panning = false;
        const [a, b] = [...pointers.values()];
        gPrevDist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        gPrevAng = Math.atan2(b.y - a.y, b.x - a.x);
        gPrevMidX = (a.x + b.x) / 2;
        gPrevMidY = (a.y + b.y) / 2;
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) {
        // hover only
        const p = xy(e);
        hover = pick(p.x, p.y);
        canvas.style.cursor = hover ? "pointer" : "default";
        return;
      }
      const p = xy(e);
      pointers.set(e.pointerId, p);

      if (pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        // pan by midpoint movement
        view.offX += midX - gPrevMidX;
        view.offY += midY - gPrevMidY;
        // pinch zoom + twist rotate around midpoint
        applyAround(midX, midY, view.scale * (dist / gPrevDist), view.rot + (ang - gPrevAng));
        gPrevDist = dist;
        gPrevAng = ang;
        gPrevMidX = midX;
        gPrevMidY = midY;
        return;
      }

      moved += Math.abs(p.x - lastX) + Math.abs(p.y - lastY);
      if (dragNode) {
        const w = screenToWorld(p.x, p.y);
        dragNode.x = w.x;
        dragNode.y = w.y;
        dragNode.vx = 0;
        dragNode.vy = 0;
        alpha = Math.max(alpha, 0.5);
      } else if (panning) {
        view.offX += p.x - lastX;
        view.offY += p.y - lastY;
      }
      lastX = p.x;
      lastY = p.y;
    };
    const onUp = (e: PointerEvent) => {
      const p = xy(e);
      const wasOne = pointers.size === 1;
      pointers.delete(e.pointerId);
      if (wasOne) {
        const click = moved < 6 && Math.hypot(p.x - downX, p.y - downY) < 6;
        if (dragNode) {
          const node = dragNode;
          dragNode.fixed = false;
          dragNode = null;
          if (click) {
            router.push(`/memo/${node.id}`);
            return;
          }
        }
        panning = false;
      }
      // if dropping from 2->1, reset single-pointer baseline
      if (pointers.size === 1) {
        const [only] = [...pointers.values()];
        lastX = only.x;
        lastY = only.y;
        downX = only.x;
        downY = only.y;
        moved = 999; // prevent accidental click after gesture
        panning = true;
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      applyAround(px, py, view.scale * Math.exp(-e.deltaY * 0.0015), view.rot);
    };

    resize();
    window.addEventListener("resize", resize);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    run();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("wheel", onWheel);
      ctrlRef.current = null;
    };
  }, [router]);

  const btn: React.CSSProperties = {
    width: 40,
    height: 40,
    borderRadius: 10,
    border: `1px solid ${C.separator}`,
    background: "rgba(255,255,255,0.95)",
    color: C.text,
    fontSize: 18,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }}
      />
      {/* 操作ボタン */}
      <div
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <button style={btn} aria-label="拡大" onClick={() => ctrlRef.current?.zoom(1.25)}>
          +
        </button>
        <button style={btn} aria-label="縮小" onClick={() => ctrlRef.current?.zoom(0.8)}>
          −
        </button>
        <button
          style={btn}
          aria-label="左回転"
          onClick={() => ctrlRef.current?.rotate(-Math.PI / 12)}
        >
          ⟲
        </button>
        <button
          style={btn}
          aria-label="右回転"
          onClick={() => ctrlRef.current?.rotate(Math.PI / 12)}
        >
          ⟳
        </button>
        <button
          style={{ ...btn, fontSize: 12 }}
          aria-label="リセット"
          onClick={() => ctrlRef.current?.reset()}
        >
          リセット
        </button>
      </div>
      {status !== "ready" ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: C.secondary,
            fontSize: 14,
            pointerEvents: "none",
          }}
        >
          {status === "loading"
            ? "読み込み中..."
            : status === "empty"
              ? "メモがありません"
              : "読み込みエラー: " + msg}
        </div>
      ) : null}
      <div
        style={{
          position: "absolute",
          left: 12,
          bottom: 12,
          fontSize: 11,
          color: C.secondary,
          background: "rgba(255,255,255,0.8)",
          padding: "4px 8px",
          borderRadius: 8,
          pointerEvents: "none",
        }}
      >
        タップで該当メモへ ・ ドラッグで移動 ・ ホイール/ピンチで拡大縮小 ・ 2本指ひねり/ボタンで回転
      </div>
    </>
  );
}
