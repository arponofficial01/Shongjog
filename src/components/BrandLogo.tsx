import React from 'react';

interface BrandLogoProps {
  size?: number;
  className?: string;
}

/**
 * Shongjog (সংযোগ) Brand Mark — Next-Gen Ultra Luxury
 *
 * Elegant, sleek, minimalist messaging identity:
 * Two gracefully converging chat nodes with a radiant central connection node.
 * Pure modern craft, timeless tech aesthetic.
 */
export const BrandLogo: React.FC<BrandLogoProps> = ({ size = 28, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`brand-logo-vector ${className || ''}`}
    aria-hidden="true"
  >
    <defs>
      {/* Premium Background Gradient */}
      <linearGradient id="sj-bg-grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#0ea5e9" />
        <stop offset="38%" stopColor="#06b6d4" />
        <stop offset="76%" stopColor="#10b981" />
        <stop offset="100%" stopColor="#059669" />
      </linearGradient>

      {/* Surface Luster Specular */}
      <linearGradient id="sj-luster" x1="4" y1="4" x2="44" y2="24" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45" />
        <stop offset="100%" stopColor="#ffffff" stopOpacity="0.03" />
      </linearGradient>

      {/* Primary chat bubble fill */}
      <linearGradient id="sj-bubble-front" x1="12" y1="12" x2="38" y2="38" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.98" />
        <stop offset="100%" stopColor="#e0f2fe" stopOpacity="0.92" />
      </linearGradient>

      {/* Secondary accent bubble */}
      <linearGradient id="sj-bubble-back" x1="6" y1="10" x2="28" y2="32" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.8" />
        <stop offset="100%" stopColor="#34d399" stopOpacity="0.65" />
      </linearGradient>

      {/* Connection Spark Glow */}
      <filter id="sj-spark-glow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="1.5" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>

    {/* Squircle Badge Container */}
    <rect
      x="2"
      y="2"
      width="44"
      height="44"
      rx="14"
      fill="url(#sj-bg-grad)"
    />

    {/* Subtle Glass Inner Border */}
    <rect
      x="2.5"
      y="2.5"
      width="43"
      height="43"
      rx="13.5"
      stroke="url(#sj-luster)"
      strokeWidth="1"
    />

    {/* Secondary background chat node (Subtle depth) */}
    <path
      d="M13 15C13 12.2386 15.2386 10 18 10H25C27.7614 10 30 12.2386 30 15V22C30 24.7614 27.7614 27 25 27H20L15.5 30.5C14.8333 31.0256 13.88 30.551 13.92 29.708L14.1 27H18C15.2386 27 13 24.7614 13 22V15Z"
      fill="url(#sj-bubble-back)"
      opacity="0.75"
    />

    {/* Primary foreground chat pebble (Crisp, clean, iconic) */}
    <path
      d="M17 18C17 14.6863 19.6863 12 23 12H32C35.3137 12 38 14.6863 38 18V26C38 29.3137 35.3137 32 32 32H30.5L25.8 36.2C25.05 36.85 23.9 36.3 23.95 35.3L24.1 32H23C19.6863 32 17 29.3137 17 26V18Z"
      fill="url(#sj-bubble-front)"
    />

    {/* Modern Dynamic Signal / Connection Lines inside primary bubble */}
    <rect x="22" y="18" width="11" height="2.5" rx="1.25" fill="#0891b2" />
    <rect x="22" y="23" width="7" height="2.5" rx="1.25" fill="#10b981" />

    {/* Radiant Pulse Dot at the connection tail */}
    <circle cx="33" cy="24.25" r="2" fill="#06b6d4" filter="url(#sj-spark-glow)" />
  </svg>
);

export default BrandLogo;
