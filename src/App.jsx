import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import MobileDrawer from './MobileDrawer.jsx';
import QRPanel from './QRPanel.jsx';
import logger from './logger.js';
import './App.css';

// ── 1. CONFIGURATION ──────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── 2. SESSION ID ─────────────────────────────────────────
const getSessionId = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get('session') || Math.random().toString(36).slice(2, 8);
};
const sessionId = getSessionId();

// ── COMPOSANT PRINCIPAL ───────────────────────────────────
function App() {

  // Détection mode mobile
  const params     = new URLSearchParams(window.location.search);
  const isMobile   = params.get('mode') === 'mobile';
  const urlSession = params.get('session');

  if (isMobile && urlSession) {
    return <MobileDrawer sessionId={urlSession} />;
  }

  const canvasRef  = useRef(null);
  const isDrawing  = useRef(false);
  const pointQueue = useRef([]);
  const rafActive  = useRef(false);
  const channelRef = useRef(null);

  const [color, setColor]           = useState('#ffffff');
  const [size, setSize]             = useState(3);
  const [connStatus, setConnStatus] = useState('connecting');
  const [eraserMode, setEraserMode] = useState(false);

  const colorRef  = useRef(color);
  const sizeRef   = useRef(size);
  const eraserRef = useRef(eraserMode);

  useEffect(() => { colorRef.current  = color;      }, [color]);
  useEffect(() => { sizeRef.current   = size;       }, [size]);
  useEffect(() => { eraserRef.current = eraserMode; }, [eraserMode]);

  // ── 3. NORMALISATION ──────────────────────────────────────
  const normalize = useCallback((clientX, clientY) => ({
    x: clientX / window.innerWidth,
    y: clientY / window.innerHeight,
  }), []);

  const denormalize = useCallback((nx, ny, canvas) => {
    const dpr = window.devicePixelRatio || 1;
    return {
      px: nx * (canvas.width  / dpr),
      py: ny * (canvas.height / dpr),
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');

    // ── 4. CANVAS SMART TV / RETINA ──────────────────────
    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;

      canvas.width  = window.innerWidth  * dpr;
      canvas.height = window.innerHeight * dpr;

      canvas.style.width  = window.innerWidth  + 'px';
      canvas.style.height = window.innerHeight + 'px';

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap  = 'round';
      ctx.lineJoin = 'round';

      logger.info('Canvas redimensionné', {
        cssSize: `${window.innerWidth}x${window.innerHeight}`,
        dpr,
      });
    };

    resizeCanvas();

    const observer = new ResizeObserver(() => resizeCanvas());
    observer.observe(canvas);

    // ── 5. BOUCLE RAF ────────────────────────────────────
    const renderLoop = () => {
      while (pointQueue.current.length > 0) {
        const pt = pointQueue.current.shift();
        const { px, py } = denormalize(pt.x ?? 0, pt.y ?? 0, canvas);

        if (pt.type === 'start') {
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.strokeStyle = pt.color;
          ctx.lineWidth   = pt.size;
          ctx.lineCap     = 'round';
          ctx.lineJoin    = 'round';
        } else if (pt.type === 'move') {
          ctx.lineTo(px, py);
          ctx.stroke();
        } else if (pt.type === 'end') {
          ctx.closePath();
        } else if (pt.type === 'clear') {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
      requestAnimationFrame(renderLoop);
    };

    if (!rafActive.current) {
      rafActive.current = true;
      requestAnimationFrame(renderLoop);
    }

    // ── 6. SUPABASE REALTIME ──────────────────────────────
    const channel = supabase
      .channel(`board-${sessionId}`)
      .on('broadcast', { event: 'draw' }, ({ payload }) => {
        pointQueue.current.push(payload);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnStatus('connected');
          logger.info('Connecté au canal Supabase', {
            sessionId,
            screen: `${window.innerWidth}x${window.innerHeight}`,
            dpr: window.devicePixelRatio || 1,
          });
        } else {
          logger.warn('Statut channel', { status });
        }
      });

    channelRef.current = channel;

    // ── 7. ENVOI D'UN POINT ───────────────────────────────
    const sendPoint = (type, clientX, clientY) => {
      const normalized = clientX !== undefined
        ? normalize(clientX, clientY)
        : {};

      const payload = {
        type,
        ...normalized,
        color: eraserRef.current ? '#1a1a1a' : colorRef.current,
        size:  eraserRef.current ? sizeRef.current * 3 : sizeRef.current,
      };

      pointQueue.current.push(payload);
      channel.send({ type: 'broadcast', event: 'draw', payload });
    };

    // ── 8. ÉVÉNEMENTS SOURIS ──────────────────────────────
    const onMouseDown = (e) => {
      isDrawing.current = true;
      sendPoint('start', e.clientX, e.clientY);
    };
    const onMouseMove = (e) => {
      if (!isDrawing.current) return;
      sendPoint('move', e.clientX, e.clientY);
    };
    const onMouseUp = () => {
      if (!isDrawing.current) return;
      isDrawing.current = false;
      sendPoint('end');
    };

    // ── 9. ÉVÉNEMENTS TACTILES ────────────────────────────
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

    window.addEventListener('mousedown',  onMouseDown);
    window.addEventListener('mousemove',  onMouseMove);
    window.addEventListener('mouseup',    onMouseUp);
    window.addEventListener('touchstart', onTouchStart, { passive: false });
    window.addEventListener('touchmove',  onTouchMove,  { passive: false });
    window.addEventListener('touchend',   onTouchEnd);

    // ── 10. CLEANUP ───────────────────────────────────────
    return () => {
      window.removeEventListener('mousedown',  onMouseDown);
      window.removeEventListener('mousemove',  onMouseMove);
      window.removeEventListener('mouseup',    onMouseUp);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove',  onTouchMove);
      window.removeEventListener('touchend',   onTouchEnd);
      observer.disconnect();
      channel.unsubscribe();
    };
  }, []);

  // ── 11. EFFACER TOUT ──────────────────────────────────
  const handleClear = useCallback(() => {
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
  }, []);

  // ── 12. RENDU JSX ─────────────────────────────────────
  return (
    <>
      {/* Badge statut */}
      <div className={`status-badge ${connStatus}`}>
        {connStatus === 'connected'
          ? `● Session : ${sessionId}`
          : '○ Connexion…'}
      </div>

      {/* QR Code */}
      <QRPanel sessionId={sessionId} />

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        style={{ background: '#1a1a1a', width: '100vw', height: '100vh' }}
      />

      {/* Toolbar */}
      <div className="toolbar">

        <label>Couleur</label>
        <input
          type="color"
          className="color-picker"
          value={color}
          onChange={(e) => setColor(e.target.value)}
        />

        <label>Épaisseur</label>
        <input
          type="range"
          className="size-slider"
          min={1}
          max={20}
          value={size}
          onChange={(e) => setSize(Number(e.target.value))}
        />

        {/* Gomme */}
        <button
          className="btn-clear"
          style={{
            background: eraserMode
              ? 'rgba(255,255,255,0.2)'
              : 'rgba(255,255,255,0.05)',
            color: 'white',
            border: eraserMode
              ? '1px solid white'
              : '1px solid rgba(255,255,255,0.2)',
            marginRight: 8,
          }}
          onClick={() => setEraserMode(!eraserMode)}
        >
          {eraserMode ? '✏️ Dessiner' : '◻️ Gomme'}
        </button>

        {/* Effacer tout */}
        <button className="btn-clear" onClick={handleClear}>
          🗑 Effacer
        </button>

        {/* Export logs */}
        <button
          className="btn-clear"
          style={{ fontSize: 10, padding: '4px 10px', opacity: 0.6 }}
          onClick={() => logger.export()}
          title="Exporter les logs"
        >
          📋 Logs
        </button>

      </div>
    </>
  );
}

export default App;
