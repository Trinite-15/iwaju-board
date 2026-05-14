import React, { useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import logger from './logger.js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY
);

function MobileDrawer({ sessionId }) {
  const canvasRef  = useRef(null);
  const isDrawing  = useRef(false);
  const channelRef = useRef(null);
  const colorRef   = useRef('#ffffff');
  const sizeRef    = useRef(6);
  const eraserRef  = useRef(false);

  const [color, setColor]           = useState('#ffffff');
  const [size, setSize]             = useState(6);
  const [eraserMode, setEraserMode] = useState(false);
  const [connected, setConnected]   = useState(false);

  useEffect(() => { colorRef.current  = color;      }, [color]);
  useEffect(() => { sizeRef.current   = size;       }, [size]);
  useEffect(() => { eraserRef.current = eraserMode; }, [eraserMode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');

    // Dimensionner le canvas selon l'écran actuel
    const initCanvas = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
      ctx.lineCap  = 'round';
      ctx.lineJoin = 'round';
    };

    initCanvas();

    // ── Gestion rotation paysage/portrait ──────────────────
    const handleResize = () => {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;

      ctx.putImageData(imageData, 0, 0);
      ctx.lineCap  = 'round';
      ctx.lineJoin = 'round';

      logger.info('Rotation détectée', {
        orientation: window.innerWidth > window.innerHeight ? 'paysage' : 'portrait',
        size: `${window.innerWidth}x${window.innerHeight}`,
      });
    };

    window.addEventListener('resize', handleResize);

    // ── Canal Supabase ─────────────────────────────────────
    const channel = supabase
      .channel(`board-${sessionId}`)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnected(true);
          logger.info('Mobile connecté', { sessionId });
        }
      });

    channelRef.current = channel;

    // ── Normalisation ──────────────────────────────────────
    const normalize = (clientX, clientY) => ({
      x: clientX / window.innerWidth,
      y: clientY / window.innerHeight,
    });

    // ── Envoi d'un point + dessin local ───────────────────
    const sendPoint = (type, clientX, clientY) => {
      const normalized = clientX !== undefined ? normalize(clientX, clientY) : {};
      const color = eraserRef.current ? '#1a1a1a' : colorRef.current;
      const size  = eraserRef.current ? sizeRef.current * 4 : sizeRef.current;

      // Dessin local immédiat sur le téléphone
      if (type === 'start' && clientX !== undefined) {
        ctx.beginPath();
        ctx.moveTo(clientX, clientY);
        ctx.strokeStyle = color;
        ctx.lineWidth   = size;
        ctx.lineCap     = 'round';
        ctx.lineJoin    = 'round';
      } else if (type === 'move' && clientX !== undefined) {
        ctx.lineTo(clientX, clientY);
        ctx.stroke();
      } else if (type === 'end') {
        ctx.closePath();
      } else if (type === 'clear') {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }

      // Envoi vers le PC via Supabase
      channel.send({
        type: 'broadcast',
        event: 'draw',
        payload: { type, ...normalized, color, size },
      });
    };

    // ── Événements tactiles ────────────────────────────────
    const onTouchStart = (e) => {
      e.preventDefault();
      isDrawing.current = true;
      const t = e.touches[0];
      sendPoint('start', t.clientX, t.clientY);
    };

    const onTouchMove = (e) => {
      e.preventDefault();
      if (!isDrawing.current) return;
      const t = e.touches[0];
      sendPoint('move', t.clientX, t.clientY);
    };

    const onTouchEnd = () => {
      if (!isDrawing.current) return;
      isDrawing.current = false;
      sendPoint('end');
    };

    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove',  onTouchMove,  { passive: false });
    canvas.addEventListener('touchend',   onTouchEnd);

    // ── Cleanup ────────────────────────────────────────────
    return () => {
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove',  onTouchMove);
      canvas.removeEventListener('touchend',   onTouchEnd);
      window.removeEventListener('resize',     handleResize);
      channel.unsubscribe();
    };
  }, [sessionId]);

  // ── Bouton effacer tout ────────────────────────────────
  const handleClear = () => {
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'draw',
        payload: { type: 'clear' },
      });
    }
  };

  // ── Rendu ──────────────────────────────────────────────
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#1a1a1a', position: 'relative', overflow: 'hidden' }}>

      {/* Badge connexion */}
      <div style={{
        position: 'fixed', top: 12, right: 12,
        background: connected ? 'rgba(0,200,100,0.15)' : 'rgba(255,200,0,0.15)',
        color: connected ? '#00c864' : '#ffc800',
        border: `1px solid ${connected ? 'rgba(0,200,100,0.3)' : 'rgba(255,200,0,0.3)'}`,
        borderRadius: 20, padding: '4px 12px',
        fontSize: 11, fontFamily: 'monospace', zIndex: 100,
      }}>
        {connected ? '● Connecté' : '○ Connexion…'}
      </div>

      {/* Canvas plein écran */}
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100vw',
          height: '100vh',
          touchAction: 'none',
        }}
      />

      {/* Toolbar mobile compacte */}
      <div style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: 'rgba(20,20,20,0.92)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 60,
        padding: '12px 20px',
        zIndex: 100,
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      }}>

        {/* Couleur */}
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          style={{
            width: 40, height: 40,
            borderRadius: '50%',
            border: '2px solid rgba(255,255,255,0.3)',
            cursor: 'pointer',
            padding: 0,
            background: 'none',
          }}
        />

        {/* Épaisseur */}
        <input
          type="range"
          min={2}
          max={30}
          value={size}
          onChange={(e) => setSize(Number(e.target.value))}
          style={{ width: 80, accentColor: 'white' }}
        />

        {/* Gomme */}
        <button
          onClick={() => setEraserMode(!eraserMode)}
          style={{
            background: eraserMode ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.05)',
            color: 'white',
            border: `1px solid ${eraserMode ? 'white' : 'rgba(255,255,255,0.2)'}`,
            borderRadius: 30,
            padding: '8px 16px',
            fontSize: 14,
            cursor: 'pointer',
            fontFamily: 'monospace',
          }}
        >
          {eraserMode ? '✏️' : '◻️'}
        </button>

        {/* Effacer tout */}
        <button
          onClick={handleClear}
          style={{
            background: 'rgba(220,50,50,0.2)',
            color: '#ff6b6b',
            border: '1px solid rgba(220,50,50,0.4)',
            borderRadius: 30,
            padding: '8px 16px',
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          🗑
        </button>

      </div>
    </div>
  );
}

export default MobileDrawer;
