"use client";

import { useEffect, useRef } from "react";

const HEART_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23e8637a"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.27 2 8.5 2 5.41 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.08C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.41 22 8.5c0 3.77-3.4 6.86-8.55 11.53L12 21.35z"/></svg>';

interface Particle {
  x: number;
  y: number;
  size: number;
  speed: number;
  opacity: number;
  drift: number;
  phase: number;
}

export function HeartParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const particles: Particle[] = [];
    const image = new Image();
    image.src = `data:image/svg+xml,${HEART_SVG}`;

    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * ratio;
      canvas.height = window.innerHeight * ratio;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const seed = () => {
      particles.length = 0;
      for (let index = 0; index < 24; index += 1) {
        particles.push({
          x: Math.random() * window.innerWidth,
          y: Math.random() * window.innerHeight,
          size: 8 + Math.random() * 12,
          speed: 0.25 + Math.random() * 0.6,
          opacity: 0.12 + Math.random() * 0.28,
          drift: (Math.random() - 0.5) * 0.5,
          phase: Math.random() * Math.PI * 2,
        });
      }
    };

    let frame = 0;
    let mounted = true;

    const draw = () => {
      if (!mounted) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      const time = performance.now() / 1000;

      for (const particle of particles) {
        particle.y -= particle.speed;
        particle.x += Math.sin(time + particle.phase) * particle.drift;
        if (particle.y + particle.size < 0) {
          particle.y = window.innerHeight + particle.size;
          particle.x = Math.random() * window.innerWidth;
        }

        context.globalAlpha = particle.opacity;
        context.drawImage(image, particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
      }

      context.globalAlpha = 1;
      frame = window.requestAnimationFrame(draw);
    };

    resize();
    seed();
    window.addEventListener("resize", resize);
    image.onload = () => {
      draw();
    };

    return () => {
      mounted = false;
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-0" aria-hidden="true" />;
}

