// MobileDrawer.jsx — Interface mobile dédiée

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
  const [isPortrait, setIsPortrait] = useState(
    window.innerHeight > window.innerWidth
  );

  useEffect(() => { colorRef.current  = color;      }, [color]);
  useEffect(() => { sizeRef.current   = size;       }, [size]);
  useEffect(() => { eraserRef.current = eraserMode; }, [eraserMode]);

  useEffect(() => {
    const checkOrientation = () => setIsPortrait(window.innerHeight > window.innerWidth);
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  useEffect(() => {
    if (screen?.orientation?.lock) {
      screen.orientation.lock('landscape').catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (isPortrait) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';

    const handleResize = () => {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
      ctx.putImageData(imageData, 0, 0);
      ctx.lineCap  = 'round';
      ctx.lineJoin = 'round';
      logger.info('Resize mobile', { size: `${window.innerWidth}x${window.innerHeight}` });
    };

    window.addEventListener('resize', handleResize);

    const channel = supabase
      .channel(`board-${sessionId}`)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnected(true);
          logger.info('Mobile connecté', { sessionId });
        }
      });

    channelRef.current = channel;

    const normalize = (clientX, clientY) => ({
      x: clientX / window.innerWidth,
      y: clientY / window.innerHeight,
    });

    const sendPoint = (type, clientX, clientY) => {
      const normalized = clientX !== undefined ? normalize(clientX, clientY) : {};
      const color = eraserRef.current ? '#1a1a1a' : colorRef.current;
      const size  = eraserRef.current ? sizeRef.current * 4 : sizeRef.current;

      if (type === 'start' && clientX !== undefined) {
        ctx.beginPath(); ctx.moveTo(clientX, clientY);
        ctx.strokeStyle = color; ctx.lineWidth = size;
      } else if (type === 'move' && clientX !== undefined) {
        ctx.lineTo(clientX, clientY); ctx.stroke();
      } else if (type === 'end') {
        ctx.closePath();
      } else if (type === 'clear') {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }

      channel.send({ type: 'broadcast', event: 'draw', payload: { type, ...normalized, color, size } });
    };

    const onTouchStart = (e) => { e.preventDefault(); isDrawing.current = true; const t = e.touches[0]; sendPoint('start', t.clientX, t.clientY); };
    const onTouchMove  = (e) => { e.preventDefault(); if (!isDrawing.current) return; const t = e.touches[0]; sendPoint('move', t.clientX, t.clientY); };
    const onTouchEnd   = ()  => { if (!isDrawing.current) return; isDrawing.current = false; sendPoint('end'); };

    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove',  onTouchMove,  { passive: false });
    canvas.addEventListener('touchend',   onTouchEnd);

    return () => {
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove',  onTouchMove);
      canvas.removeEventListener('touchend',   onTouchEnd);
      window.removeEventListener('resize',     handleResize);
      channel.unsubscribe();
    };
  }, [sessionId, isPortrait]);

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    channelRef.current?.send({ type: 'broadcast', event: 'draw', payload: { type: 'clear' } });
  };

  const handleExportImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link   = document.createElement('a');
    link.download = `iwaju-board-${Date.now()}.png`;
    link.href     = canvas.toDataURL('image/png');
    link.click();
  };

  const btnStyle = (extra = {}) => ({
    background: 'rgba(255,255,255,0.05)',
    color: 'white',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 30, padding: '6px 14px',
    fontSize: 13, cursor: 'pointer',
    ...extra,
  });

  if (isPortrait) {
    return (
      <div style={{
        width: '100vw', height: '100vh', background: '#1a1a1a',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 20, padding: '0 24px', boxSizing: 'border-box',
      }}>
        <div style={{ fontSize: 64 }}>🔄</div>
        <p style={{ color: 'white', fontFamily: 'monospace', fontSize: 18, textAlign: 'center', lineHeight: 1.8, margin: 0 }}>
          Tourne ton téléphone<br />en mode <strong>paysage</strong><br />pour dessiner
        </p>
        <div style={{
          background: 'rgba(255,200,0,0.1)', border: '1px solid rgba(255,200,0,0.3)',
          borderRadius: 12, padding: '12px 16px', maxWidth: 300,
        }}>
          <p style={{ color: '#ffc800', fontFamily: 'monospace', fontSize: 12, textAlign: 'center', lineHeight: 1.6, margin: 0 }}>
            💡 Si tu viens de scanner un QR Code,<br />
            ouvre ce lien dans <strong>Chrome</strong> ou <strong>Opera</strong><br />
            pour que la rotation fonctionne.
          </p>
        </div>
        <button
          onClick={() => navigator.clipboard.writeText(window.location.href).then(() => alert('Lien copié ! Colle-le dans Chrome.'))}
          style={btnStyle()}
        >
          📋 Copier le lien
        </button>
        <button onClick={() => setIsPortrait(false)} style={btnStyle({ opacity: 0.4 })}>
          Continuer en portrait →
        </button>
        <p style={{ color: '#333', fontFamily: 'monospace', fontSize: 10, margin: 0 }}>
          Session : {sessionId}
        </p>
      </div>
    );
  }

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#1a1a1a', position: 'relative', overflow: 'hidden' }}>

      <div style={{
        position: 'fixed', top: 10, right: 12,
        background: connected ? 'rgba(0,200,100,0.15)' : 'rgba(255,200,0,0.15)',
        color: connected ? '#00c864' : '#ffc800',
        border: `1px solid ${connected ? 'rgba(0,200,100,0.3)' : 'rgba(255,200,0,0.3)'}`,
        borderRadius: 20, padding: '4px 10px',
        fontSize: 10, fontFamily: 'monospace', zIndex: 100,
      }}>
        {connected ? '● Connecté' : '○ Connexion…'}
      </div>

      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100vw', height: '100vh', touchAction: 'none' }}
      />

      <div style={{
        position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: 10,
        background: 'rgba(20,20,20,0.92)', backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 50, padding: '10px 18px',
        zIndex: 100, boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      }}>

        <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
          style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', cursor: 'pointer', padding: 0, background: 'none' }}
        />

        <input type="range" min={2} max={30} value={size}
          onChange={(e) => setSize(Number(e.target.value))}
          style={{ width: 70, accentColor: 'white' }}
        />

        <button onClick={() => setEraserMode(!eraserMode)}
          style={btnStyle({ background: eraserMode ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.05)', border: `1px solid ${eraserMode ? 'white' : 'rgba(255,255,255,0.2)'}` })}
        >
          {eraserMode ? '✏️' : '◻️'}
        </button>

        <button onClick={handleClear}
          style={btnStyle({ background: 'rgba(220,50,50,0.2)', color: '#ff6b6b', border: '1px solid rgba(220,50,50,0.4)' })}
        >
          🗑
        </button>

        <button onClick={handleExportImage}
          style={btnStyle({ background: 'rgba(0,200,100,0.15)', color: '#00c864', border: '1px solid rgba(0,200,100,0.3)' })}
          title="Télécharger le dessin"
        >
          🖼
        </button>

        <button onClick={() => logger.export()} title="Logs techniques"
          style={btnStyle({ opacity: 0.4, padding: '6px 10px', fontSize: 11 })}
        >
          📋
        </button>

      </div>
    </div>
  );
}

export default MobileDrawer;