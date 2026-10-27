import React, { useEffect, useRef } from "react";

const GLYPHS = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン0123456789ABCDEF<>/{}[]=+*$#";
const CELL = 18;
const FRAME_MS = 70;

/**
 * Decorative digital rain behind the Matrix Terminal palette. It never takes
 * input, stays behind content and freezes for reduced motion, the workspace
 * "quiet motion" option and hidden windows.
 */
export function MatrixRain() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current,
      context = element?.getContext("2d");
    if (!element || !context) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let drops: number[] = [],
      width = 0,
      height = 0,
      frame = 0,
      last = 0;
    const glyph = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
    const still = () =>
      reduced.matches ||
      document.hidden ||
      document.documentElement.classList.contains("quietMotion");
    const resize = () => {
      const box = element.getBoundingClientRect(),
        ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = box.width;
      height = box.height;
      element.width = Math.max(1, Math.floor(width * ratio));
      element.height = Math.max(1, Math.floor(height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.font = `${CELL - 4}px ui-monospace, "Cascadia Code", Consolas, monospace`;
      context.textBaseline = "top";
      drops = Array.from({ length: Math.ceil(width / CELL) }, () => -Math.random() * (height / CELL));
      if (still()) {
        // A single calm frame keeps the texture without any movement.
        for (let x = 0; x < drops.length; x++)
          for (let y = 0; y < height / CELL; y++)
            if (Math.random() < 0.06) {
              context.fillStyle = `rgba(57, 255, 122, ${0.15 + Math.random() * 0.35})`;
              context.fillText(glyph(), x * CELL, y * CELL);
            }
      }
    };
    const draw = (time: number) => {
      frame = requestAnimationFrame(draw);
      if (still() || time - last < FRAME_MS) return;
      last = time;
      // Fade previous glyphs towards transparency so the page background shows through.
      context.globalCompositeOperation = "destination-out";
      context.fillStyle = "rgba(0, 0, 0, 0.12)";
      context.fillRect(0, 0, width, height);
      context.globalCompositeOperation = "source-over";
      for (let x = 0; x < drops.length; x++) {
        const y = drops[x] * CELL;
        if (y >= 0) {
          context.fillStyle = "rgba(57, 255, 122, 0.85)";
          context.fillText(glyph(), x * CELL, y);
          context.fillStyle = "rgba(210, 255, 222, 0.95)";
          context.fillText(glyph(), x * CELL, y + CELL);
        }
        drops[x] = y > height && Math.random() > 0.965 ? -Math.random() * 12 : drops[x] + 1;
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);
  return <canvas ref={canvas} className="matrix-rain" aria-hidden="true" />;
}
