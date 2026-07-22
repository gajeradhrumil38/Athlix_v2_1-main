import React from 'react'

export const LoadingScreen: React.FC<{ fading?: boolean }> = ({ fading = false }) => (
  <div
    style={{
      position: 'fixed',
      inset: 0,
      background: '#030508',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      opacity: fading ? 0 : 1,
      transition: 'opacity 350ms ease',
      zIndex: 9998,
      pointerEvents: fading ? 'none' : 'auto',
    }}
  >
    <svg width="0" height="0" style={{ position: 'absolute' }}>
      <defs>
        <linearGradient id="athlix-grad" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="#C8FF00">
            <animate
              attributeName="stop-color"
              values="#C8FF00; #a78bfa; #C8FF00"
              dur="2.4s"
              repeatCount="indefinite"
            />
          </stop>
          <stop offset="55%" stopColor="#a78bfa">
            <animate
              attributeName="stop-color"
              values="#a78bfa; #C8FF00; #a78bfa"
              dur="2.4s"
              repeatCount="indefinite"
            />
          </stop>
          <stop offset="100%" stopColor="#4ade80">
            <animate
              attributeName="stop-color"
              values="#4ade80; #C8FF00; #4ade80"
              dur="2.4s"
              repeatCount="indefinite"
            />
          </stop>
        </linearGradient>

        {/* subtle noise-like filter for depth */}
        <filter id="athlix-glow">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
    </svg>

    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Ambient glow behind the A */}
      <div
        style={{
          position: 'absolute',
          width: 120,
          height: 120,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(200,255,0,0.18) 0%, rgba(167,139,250,0.10) 55%, transparent 75%)',
          animation: 'athlix-pulse 2.4s ease-in-out infinite',
          filter: 'blur(12px)',
        }}
      />

      {/* The A */}
      <svg
        viewBox="0 0 100 110"
        width="96"
        height="96"
        style={{ position: 'relative', zIndex: 1 }}
      >
        {/* Clip path so gradient only fills the letter shape */}
        <defs>
          <clipPath id="a-clip">
            <text
              x="50"
              y="95"
              textAnchor="middle"
              fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', sans-serif"
              fontSize="108"
              fontWeight="900"
              letterSpacing="-4"
            >
              A
            </text>
          </clipPath>
        </defs>

        {/* Gradient rect clipped to the A shape */}
        <rect
          x="0"
          y="0"
          width="100"
          height="110"
          fill="url(#athlix-grad)"
          clipPath="url(#a-clip)"
          style={{ animation: 'athlix-slide 2.4s ease-in-out infinite' }}
        />
      </svg>
    </div>

    <style>{`
      @keyframes athlix-pulse {
        0%, 100% { opacity: 0.6; transform: scale(1); }
        50%       { opacity: 1;   transform: scale(1.25); }
      }
      @keyframes athlix-slide {
        0%, 100% { transform: translateY(0); }
        50%       { transform: translateY(-6px); }
      }
    `}</style>
  </div>
)
