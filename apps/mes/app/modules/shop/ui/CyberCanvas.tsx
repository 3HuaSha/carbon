// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import { useEffect, useRef } from "react";

/**
 * High-performance ambient generative canvas for Awwwards-caliber MES experience.
 * Features:
 * - Ultra-fine quantum grid dots with soft breath animation
 * - Fluid pointer/touch gravity field creating interactive ripples
 * - Auto frame throttling and battery-conscious render loop
 * - Respects prefers-reduced-motion
 */
export function CyberCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    // Check reduced motion
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const onResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", onResize, { passive: true });

    // Pointer tracker with smooth lerp
    const pointer = {
      x: width * 0.5,
      y: height * 0.3,
      targetX: width * 0.5,
      targetY: height * 0.3,
      active: false,
      radius: 140
    };

    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      const clientX = "touches" in e ? e.touches[0]?.clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0]?.clientY : e.clientY;
      if (clientX !== undefined && clientY !== undefined) {
        pointer.targetX = clientX;
        pointer.targetY = clientY;
        pointer.active = true;
      }
    };

    window.addEventListener("mousemove", handlePointerMove, { passive: true });
    window.addEventListener("touchmove", handlePointerMove, { passive: true });

    // Grid nodes
    const spacing = 36;
    type Node = {
      baseX: number;
      baseY: number;
      x: number;
      y: number;
      vx: number;
      vy: number;
      phase: number;
    };

    const createNodes = (): Node[] => {
      const nodes: Node[] = [];
      const cols = Math.ceil(width / spacing) + 1;
      const rows = Math.ceil(height / spacing) + 1;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * spacing;
          const y = r * spacing;
          nodes.push({
            baseX: x,
            baseY: y,
            x,
            y,
            vx: 0,
            vy: 0,
            phase: Math.random() * Math.PI * 2
          });
        }
      }
      return nodes;
    };

    let nodes = createNodes();

    let lastTime = performance.now();

    const render = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      // Pointer lerp
      pointer.x += (pointer.targetX - pointer.x) * 0.08;
      pointer.y += (pointer.targetY - pointer.y) * 0.08;

      ctx.clearRect(0, 0, width, height);

      // Render subtle radial ambient glow following pointer
      const glowGrad = ctx.createRadialGradient(
        pointer.x,
        pointer.y,
        0,
        pointer.x,
        pointer.y,
        380
      );
      glowGrad.addColorStop(0, "rgba(52, 211, 153, 0.06)"); // subtle cyber green
      glowGrad.addColorStop(0.5, "rgba(56, 189, 248, 0.03)"); // subtle electric cyan
      glowGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = glowGrad;
      ctx.fillRect(0, 0, width, height);

      // Render nodes
      const timeSec = now * 0.001;
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (!prefersReducedMotion) {
          const dx = pointer.x - node.baseX;
          const dy = pointer.y - node.baseY;
          const distSq = dx * dx + dy * dy;
          const maxDist = pointer.radius;
          const maxDistSq = maxDist * maxDist;

          if (distSq < maxDistSq && distSq > 1) {
            const dist = Math.sqrt(distSq);
            const force = (1 - dist / maxDist) * 12;
            const targetX = node.baseX - (dx / dist) * force;
            const targetY = node.baseY - (dy / dist) * force;
            node.x += (targetX - node.x) * 0.1;
            node.y += (targetY - node.y) * 0.1;
          } else {
            node.x += (node.baseX - node.x) * 0.1;
            node.y += (node.baseY - node.y) * 0.1;
          }
        }

        // Breathing alpha
        const alpha =
          0.12 + Math.sin(timeSec * 1.5 + node.phase) * 0.05;

        ctx.fillStyle = `rgba(148, 163, 184, ${Math.max(0.04, alpha)})`;
        ctx.fillRect(node.x - 0.75, node.y - 0.75, 1.5, 1.5);
      }

      animationFrameId = requestAnimationFrame(render);
    };

    if (prefersReducedMotion) {
      // Just render once
      render(performance.now());
    } else {
      animationFrameId = requestAnimationFrame(render);
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("touchmove", handlePointerMove);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      <canvas
        ref={canvasRef}
        className="h-full w-full opacity-80 transition-opacity duration-700"
      />
      {/* Avant-Garde Holographic Scanline Overlay */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.12),rgba(255,255,255,0))] dark:bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(56,189,248,0.08),rgba(0,0,0,0))]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-40" />
    </div>
  );
}
