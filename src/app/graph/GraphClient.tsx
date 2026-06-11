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

  useEffect(() => {
    let raf = 0;
    let disposed = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // ビュー変換
    const view = { scale: 1, offX: 0, offY: 0 };
    let nodes: SimNode[] = [];
    let edges: { s: SimNode; t: SimNode; reason: string | null }[] = [];
    let alpha = 1;
    let hover: SimNode | null = null;

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
      const R = Math.min(300, 30 + data.nodes.length * 4);
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
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
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
        const f = ((d - SPRING_L) * 0.04 * alpha) / 1;
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
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2 + view.offX;
      const cy = h / 2 + view.offY;
      const sx = (n: SimNode) => cx + n.x * view.scale;
      const sy = (n: SimNode) => cy + n.y * view.scale;

      // edges
      ctx.strokeStyle = "rgba(60,60,67,0.18)";
      ctx.lineWidth = 1;
      for (const e of edges) {
        ctx.beginPath();
        ctx.moveTo(sx(e.s), sy(e.s));
        ctx.lineTo(sx(e.t), sy(e.t));
        ctx.stroke();
      }
      // nodes
      const showLabels = view.scale > 0.55 || nodes.length <= 60;
      for (const n of nodes) {
        const r = radiusOf(n) * Math.min(1.4, Math.max(0.7, view.scale));
        ctx.beginPath();
        ctx.arc(sx(n), sy(n), r, 0, Math.PI * 2);
        ctx.fillStyle = areaColor(n.area);
        ctx.globalAlpha = 1;
        ctx.fill();
        if (n === hover) {
          ctx.lineWidth = 2;
          ctx.strokeStyle = C.accent;
          ctx.stroke();
        }
      }
      if (showLabels) {
        ctx.fillStyle = "#3a3a3c";
        ctx.font = "11px -apple-system, sans-serif";
        ctx.textAlign = "center";
        for (const n of nodes) {
          if (nodes.length > 80 && n.degree === 0 && n !== hover) continue;
          const label = n.title.length > 14 ? n.title.slice(0, 14) + "…" : n.title;
          ctx.fillText(label, sx(n), sy(n) + radiusOf(n) + 12);
        }
      }
    };

    const loop = () => {
      step();
      draw();
      raf = requestAnimationFrame(loop);
    };

    // ---- interaction ----
    const screenToWorld = (px: number, py: number) => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const cx = w / 2 + view.offX;
      const cy = h / 2 + view.offY;
      return { x: (px - cx) / view.scale, y: (py - cy) / view.scale };
    };
    const pick = (px: number, py: number): SimNode | null => {
      const wpt = screenToWorld(px, py);
      let best: SimNode | null = null;
      let bestD = 16 / view.scale;
      for (const n of nodes) {
        const d = Math.hypot(n.x - wpt.x, n.y - wpt.y);
        const rr = radiusOf(n) + 6;
        if (d < Math.max(bestD, rr)) {
          bestD = d;
          best = n;
        }
      }
      return best;
    };

    let dragNode: SimNode | null = null;
    let panning = false;
    let downX = 0,
      downY = 0,
      moved = 0;
    let lastX = 0,
      lastY = 0;

    const getXY = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onDown = (e: PointerEvent) => {
      const { x, y } = getXY(e);
      downX = x;
      downY = y;
      moved = 0;
      lastX = x;
      lastY = y;
      const n = pick(x, y);
      if (n) {
        dragNode = n;
        n.fixed = true;
      } else {
        panning = true;
      }
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      const { x, y } = getXY(e);
      if (dragNode || panning) {
        moved += Math.abs(x - lastX) + Math.abs(y - lastY);
      }
      if (dragNode) {
        const wpt = screenToWorld(x, y);
        dragNode.x = wpt.x;
        dragNode.y = wpt.y;
        dragNode.vx = 0;
        dragNode.vy = 0;
        alpha = Math.max(alpha, 0.5);
      } else if (panning) {
        view.offX += x - lastX;
        view.offY += y - lastY;
      } else {
        hover = pick(x, y);
        canvas.style.cursor = hover ? "pointer" : "default";
      }
      lastX = x;
      lastY = y;
    };
    const onUp = (e: PointerEvent) => {
      const { x, y } = getXY(e);
      const click = moved < 6 && Math.hypot(x - downX, y - downY) < 6;
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
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { left, top } = canvas.getBoundingClientRect();
      const px = e.clientX - left;
      const py = e.clientY - top;
      const before = screenToWorld(px, py);
      const factor = Math.exp(-e.deltaY * 0.0015);
      view.scale = Math.min(4, Math.max(0.2, view.scale * factor));
      // ズーム中心を維持
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      view.offX = px - w / 2 - before.x * view.scale;
      view.offY = py - h / 2 - before.y * view.scale;
    };

    resize();
    window.addEventListener("resize", resize);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    run();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [router]);

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }}
      />
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
        タップで該当メモへ ・ ドラッグで移動 ・ ホイールで拡大縮小
      </div>
    </>
  );
}
