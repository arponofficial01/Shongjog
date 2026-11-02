import React, { useEffect, useRef, useState } from 'react';
import { BrandLogo } from './BrandLogo';
import { ShieldCheck, ChevronRight } from 'lucide-react';

interface LoginCinematicIntroProps {
  onComplete: () => void;
}

export const LoginCinematicIntro: React.FC<LoginCinematicIntroProps> = ({ onComplete }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [isExiting, setIsExiting] = useState(false);

  // High-precision smooth progress driver with RAF
  useEffect(() => {
    const duration = 3400; // 3.4 seconds total luxury intro
    const startTime = performance.now();
    let rafId: number;

    const updateProgress = (now: number) => {
      const elapsed = now - startTime;
      const pct = Math.min(100, Math.round((elapsed / duration) * 100));
      setProgress(pct);

      if (elapsed < duration) {
        rafId = requestAnimationFrame(updateProgress);
      } else {
        setIsExiting(true);
        setTimeout(() => {
          onComplete();
        }, 360);
      }
    };

    rafId = requestAnimationFrame(updateProgress);
    return () => cancelAnimationFrame(rafId);
  }, [onComplete]);

  // Dynamic cybernetic telemetry status milestones
  const getStageTitle = (p: number) => {
    if (p < 22) return 'INITIALIZING QUANTUM ENCRYPTION VAULT...';
    if (p < 48) return 'GENERATING SOVEREIGN ED25519 CIPHER KEYS...';
    if (p < 74) return 'ESTABLISHING ZERO-KNOWLEDGE MESH PROTOCOL...';
    if (p < 95) return 'VERIFYING BIOMETRIC SECURE STORAGE...';
    return 'READY • WELCOME TO SHONGJOG';
  };

  // Canvas animated mesh particles & glowing waves (HiDPI supported)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let animId: number;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const setupDimensions = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    setupDimensions();
    window.addEventListener('resize', setupDimensions);

    // Particles array
    const w = window.innerWidth;
    const h = window.innerHeight;
    const particleCount = w < 768 ? 40 : 65;
    const particles = Array.from({ length: particleCount }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.7,
      vy: (Math.random() - 0.5) * 0.7,
      radius: Math.random() * 2 + 1,
      hue: Math.random() > 0.55 ? 160 : Math.random() > 0.3 ? 195 : 220, // Emerald, cyan, or sapphire
    }));

    let tick = 0;
    const render = () => {
      tick += 0.022;
      const curW = window.innerWidth;
      const curH = window.innerHeight;

      // Dark Obsidian Space Gradient
      const grad = ctx.createRadialGradient(
        curW / 2,
        curH / 2 - 25,
        20,
        curW / 2,
        curH / 2,
        curW * 0.75
      );
      grad.addColorStop(0, '#091522');
      grad.addColorStop(0.35, '#070f1a');
      grad.addColorStop(0.7, '#040810');
      grad.addColorStop(1, '#020408');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, curW, curH);

      // Subtle Perspective Quantum Cyber Grid at bottom
      const gridY = curH * 0.68;
      ctx.save();
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.07)';
      ctx.lineWidth = 1;
      for (let x = 0; x < curW; x += 60) {
        ctx.beginPath();
        ctx.moveTo(x, gridY);
        ctx.lineTo(x + (x - curW / 2) * 0.9, curH);
        ctx.stroke();
      }
      for (let y = gridY; y < curH; y += 28) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(curW, y);
        ctx.stroke();
      }
      ctx.restore();

      // Connect near particles with high-tech laser web lines
      const maxDist = curW < 768 ? 100 : 130;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < maxDist) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(52, 211, 153, ${0.22 * (1 - dist / maxDist)})`;
            ctx.lineWidth = 0.75;
            ctx.stroke();
          }
        }
      }

      // Draw & update particles
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > curW) p.vx *= -1;
        if (p.y < 0 || p.y > curH) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 88%, 62%, 0.85)`;
        ctx.shadowBlur = 10;
        ctx.shadowColor = `hsla(${p.hue}, 88%, 62%, 0.9)`;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      // Animated holographic orbital rings centered on the logo
      const centerX = curW / 2;
      const centerY = curH / 2 - 40;

      for (let r = 1; r <= 3; r++) {
        ctx.beginPath();
        const currentRadius = 72 + r * 36 + Math.sin(tick * 1.5 + r) * 8;
        ctx.arc(centerX, centerY, currentRadius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(16, 185, 129, ${0.16 / r})`;
        ctx.lineWidth = 1.1;
        ctx.stroke();
      }

      // 360-degree radar laser scan sweep
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(tick * 1.25);
      const sweepGrad = ctx.createLinearGradient(0, 0, 160, 0);
      sweepGrad.addColorStop(0, 'rgba(56, 189, 248, 0.28)');
      sweepGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = sweepGrad;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 160, -0.28, 0.28);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', setupDimensions);
    };
  }, []);

  return (
    <div className={`login-cinematic-intro-stage ${isExiting ? 'fade-exit' : ''}`}>
      <canvas ref={canvasRef} className="login-cinematic-canvas" />

      {/* Skip Button */}
      <button
        type="button"
        className="login-cinematic-skip-btn"
        onClick={() => {
          setIsExiting(true);
          setTimeout(onComplete, 220);
        }}
        title="Skip intro animation"
      >
        <span>Skip Intro</span>
        <ChevronRight size={14} />
      </button>

      {/* Hero Content Cluster */}
      <div className="login-cinematic-content">
        <div className="login-cinematic-logo-shell">
          <div className="login-cinematic-pulse-halo" />
          <div className="login-cinematic-cyber-orbit ring-1" />
          <div className="login-cinematic-cyber-orbit ring-2" />
          <BrandLogo size={88} />
        </div>

        <div className="login-cinematic-badge">
          <ShieldCheck size={14} />
          <span>Sovereign Direct P2P Mesh</span>
        </div>

        <h1 className="login-cinematic-title">
          Shongjog <span className="login-cinematic-bangla">সংযোগ</span>
        </h1>

        <p className="login-cinematic-subtitle">
          Next-Generation Encrypted Offline & Cloud Communication
        </p>

        {/* Progress Timeline */}
        <div className="login-cinematic-progress-container">
          <div className="login-cinematic-progress-track">
            <div
              className="login-cinematic-progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="login-cinematic-progress-meta">
            <span className="stage-milestone-text">{getStageTitle(progress)}</span>
            <span className="mono-num">{progress}%</span>
          </div>
        </div>
      </div>
    </div>
  );
};
