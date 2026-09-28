import React, { useEffect, useRef } from 'react';
import type { LaserPointerState, SpotlightState } from '../types/annotation';
import type { ScreenCurtain } from '../types/presentation';

interface EffectsLayerProps {
  width: number;
  height: number;
  laserState: LaserPointerState;
  spotlightState: SpotlightState;
  screenCurtain: ScreenCurtain;
  sourceCanvasRef?: React.RefObject<HTMLCanvasElement | null>;
}

export const EffectsLayer: React.FC<EffectsLayerProps> = ({
  width,
  height,
  laserState,
  spotlightState,
  screenCurtain,
  sourceCanvasRef,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  // Parse color to rgba helper
  const getLaserGlowColor = (color: string, alpha: number): string => {
    if (color.startsWith('#')) {
      const hex = color.replace('#', '');
      let r = 239;
      let g = 68;
      let b = 68;
      if (hex.length === 6) {
        r = parseInt(hex.substring(0, 2), 16);
        g = parseInt(hex.substring(2, 4), 16);
        b = parseInt(hex.substring(4, 6), 16);
      } else if (hex.length === 3) {
        r = parseInt(hex[0] + hex[0], 16);
        g = parseInt(hex[1] + hex[1], 16);
        b = parseInt(hex[2] + hex[2], 16);
      }
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return color;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let isRunning = true;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // 1. Screen Curtain (Black / White)
      if (screenCurtain === 'black') {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);
        return;
      } else if (screenCurtain === 'white') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        return;
      }

      // 2. Spotlight Effect with 1.5x Magnifying Glass
      if (spotlightState.active) {
        const cx = spotlightState.x * width;
        const cy = spotlightState.y * height;
        // Enlarged spotlight radius for broader view
        const radius = Math.max(160, spotlightState.radius);

        ctx.save();
        // Dark ambient overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.76)';
        ctx.fillRect(0, 0, width, height);

        // Cut out hole
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();

        // 1.5x Magnifier Zoom inside the spotlight lens
        ctx.globalCompositeOperation = 'source-over';
        const srcCanvas = sourceCanvasRef?.current;
        if (srcCanvas && srcCanvas.width > 0 && srcCanvas.height > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, cy, radius - 1, 0, Math.PI * 2);
          ctx.clip();

          const zoom = 1.5;
          ctx.translate(cx, cy);
          ctx.scale(zoom, zoom);
          ctx.translate(-cx, -cy);

          // Draw the underlying slide content enlarged
          ctx.drawImage(srcCanvas, 0, 0, width, height);

          // Glass tint
          ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
          ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
          ctx.restore();
        }

        // Lens metallic border ring
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = 3.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx, cy, radius + 2, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.45)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Curved reflection highlight on the glass lens
        ctx.beginPath();
        ctx.arc(cx, cy, radius - 8, -Math.PI * 0.85, -Math.PI * 0.2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.restore();
      }

      // 3. Laser Pointer Effect (Active ONLY when pressed)
      const now = Date.now();
      const trail = laserState.trail || [];
      const hasActiveTrail = trail.some((t) => now - t.time < 750);

      if (laserState.active || hasActiveTrail) {
        ctx.save();
        const baseColor = laserState.color || '#ef4444';

        // Draw laser lingering glow trail
        if (trail.length > 1) {
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';

          for (let i = 1; i < trail.length; i++) {
            const pPrev = trail[i - 1];
            const pCurr = trail[i];
            const agePrev = now - pPrev.time;
            const ageCurr = now - pCurr.time;

            if (ageCurr >= 750 && agePrev >= 750) continue;

            const alpha = Math.max(0, 1 - Math.min(ageCurr, agePrev) / 750);
            const x0 = pPrev.x * width;
            const y0 = pPrev.y * height;
            const x1 = pCurr.x * width;
            const y1 = pCurr.y * height;

            // Narrow, softly fading trail
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.strokeStyle = getLaserGlowColor(baseColor, alpha * 0.42);
            ctx.lineWidth = Math.max(0.8, 4 * alpha);
            ctx.stroke();

            // Fine bright center line
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.strokeStyle = getLaserGlowColor('#ffffff', alpha * 0.72);
            ctx.lineWidth = Math.max(0.65, 1.35 * alpha);
            ctx.stroke();
          }
        }

        // Draw active tip (Only if currently pressed)
        if (laserState.active) {
          const lx = laserState.x * width;
          const ly = laserState.y * height;

          // Compact laser dot: a tiny bright center fading radially outward.
          const dotRadius = 6;
          const coreGlow = ctx.createRadialGradient(lx, ly, 0, lx, ly, dotRadius);
          coreGlow.addColorStop(0, 'rgba(255, 255, 255, 1)');
          coreGlow.addColorStop(0.14, getLaserGlowColor(baseColor, 1));
          coreGlow.addColorStop(0.42, getLaserGlowColor(baseColor, 0.58));
          coreGlow.addColorStop(0.72, getLaserGlowColor(baseColor, 0.2));
          coreGlow.addColorStop(1, getLaserGlowColor(baseColor, 0));
          ctx.fillStyle = coreGlow;
          ctx.beginPath();
          ctx.arc(lx, ly, dotRadius, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }

      if (isRunning) {
        animFrameIdRef.current = requestAnimationFrame(render);
      }
    };

    animFrameIdRef.current = requestAnimationFrame(render);

    return () => {
      isRunning = false;
      if (animFrameIdRef.current !== null) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, [width, height, laserState, spotlightState, screenCurtain, sourceCanvasRef]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: `${width}px`,
        height: `${height}px`,
        pointerEvents: 'none',
        zIndex: 20,
      }}
    />
  );
};
