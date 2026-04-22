import MobileDrawer from './MobileDrawer.jsx';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import './App.css';
import QRPanel from './QRPanel.jsx'

// ─────────────────────────────────────────────
// 1. CONFIGURATION — les secrets viennent du fichier .env
//    Crée un fichier ".env" à la racine du projet avec :
//    VITE_SUPABASE_URL=https://ton-projet.supabase.co
//    VITE_SUPABASE_KEY=ta_cle_anon
// ─────────────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─────────────────────────────────────────────
// 2. LECTURE DU SESSION ID DANS L'URL
//    Ex : http://localhost:5173/?session=abc123
//    Si absent, on génère un id aléatoire pour cette session
// ─────────────────────────────────────────────
const getSessionId = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get('session') || Math.random().toString(36).slice(2, 8);
};

const sessionId = getSessionId();

// ─────────────────────────────────────────────
// COMPOSANT PRINCIPAL
// ─────────────────────────────────────────────
function App() {
  const params = new URLSearchParams(window.location.search);
  const isMobile = params.get('mode') =='mobile';
  const urlSession =params.get('session');
  if (isMobile && urlSession){
    return <MobileDrawer sessionId ={urlSession} />
  }
  const canvasRef    = useRef(null);
  const isDrawing    = useRef(false);
  const pointQueue   = useRef([]);       // File d'attente pour requestAnimationFrame
  const rafActive    = useRef(false);    // Pour ne pas lancer deux boucles RAF
  const channelRef   = useRef(null);     // Référence au channel Supabase

  // États React pour les outils (déclenchent un re-render si besoin)
  const [color, setColor]       = useState('#ffffff');
  const [size, setSize]         = useState(3);
  const [connStatus, setConnStatus] = useState('connecting'); // 'connecting' | 'connected'
  const [eraserMode,setEraserMode]= useState(false);        

  // On garde color et size dans des refs aussi pour y accéder
  // dans les event listeners sans recréer les handlers
  const colorRef = useRef(color);
  const sizeRef  = useRef(size);
  const eraserRef= useRef(eraserMode);
  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { sizeRef.current  = size;  }, [size]);
  useEffect(() => {eraserRef.current= eraserMode; },[eraserMode])

  // ─────────────────────────────────────────────
  // 3. NORMALISATION & DÉNORMALISATION
  //    Convertit pixels ↔ pourcentages (0 à 1)
  //    ESSENTIEL pour que le dessin s'aligne sur tous les écrans
  // ─────────────────────────────────────────────
  const normalize = useCallback((clientX, clientY) => ({
    x: clientX / window.innerWidth,
    y: clientY / window.innerHeight,
  }), []);

  const denormalize = useCallback((nx, ny, canvas) => ({
    px: nx * canvas.width,
    py: ny * canvas.height,
  }), []);

  useEffect(() => {
    const canvas  = canvasRef.current;
    const ctx     = canvas.getContext('2d');

    // ─────────────────────────────────────────────
    // 4. DIMENSIONNER LE CANVAS
    //    On lit les vraies dimensions CSS du canvas pour éviter
    //    le flou qui survient quand width/height CSS ≠ résolution interne
    // ─────────────────────────────────────────────
    const resizeCanvas = () => {
      // Sauvegarder l'image actuelle avant de redimensionner
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      canvas.width  = canvas.offsetWidth  || window.innerWidth;
      canvas.height = canvas.offsetHeight || window.innerHeight;
      // Restaurer l'image (elle sera un peu étirée mais le dessin ne disparaît pas)
      ctx.putImageData(imageData, 0, 0);
      // Réappliquer les styles car ils sont remis à zéro après un resize
      ctx.lineCap  = 'round';
      ctx.lineJoin = 'round';
    };

    resizeCanvas(); // Dimensionner au démarrage

    // ResizeObserver : surveille les changements de taille du canvas en continu
    const observer = new ResizeObserver(() => resizeCanvas());
    observer.observe(canvas);

    // ─────────────────────────────────────────────
    // 5. BOUCLE DE RENDU — requestAnimationFrame
    //    Ne dessine pas directement dans les callbacks Supabase
    //    On accumule dans une file, on consomme à 60fps
    // ─────────────────────────────────────────────
    const renderLoop = () => {
      while (pointQueue.current.length > 0) {
        const pt = pointQueue.current.shift();

        // Dénormaliser : pourcentages → pixels de CET écran
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
      requestAnimationFrame(renderLoop); // continue à tourner en arrière-plan
    };

    if (!rafActive.current) {
      rafActive.current = true;
      requestAnimationFrame(renderLoop); // démarrer la boucle une seule fois
    }

    // ─────────────────────────────────────────────
    // 6. CHANNEL SUPABASE REALTIME
    //    Unique par sessionId → plusieurs sessions peuvent coexister
    // ─────────────────────────────────────────────
    const channel = supabase
      .channel(`board-${sessionId}`)
      .on('broadcast', { event: 'draw' }, ({ payload }) => {
        // On reçoit un point d'un autre client → on l'ajoute dans la file
        pointQueue.current.push(payload);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnStatus('connected');
          console.log(`✅ Connecté au canal board-${sessionId}`);
        }
      });

    channelRef.current = channel;

    // ─────────────────────────────────────────────
    // 7. FONCTION D'ENVOI D'UN POINT
    //    Dessine localement ET envoie sur Supabase
    // ─────────────────────────────────────────────
    const sendPoint = (type, clientX, clientY) => {
      const normalized = (clientX !== undefined)
        ? normalize(clientX, clientY)
        : {};

      const payload = {
        type,
        ...normalized,
        color: eraserRef.current ? '#1a1a1a' :colorRef.current,
        size: eraserRef.current ? sizeRef.current *3 :sizeRef.current,
      };

      // Ajouter dans la file locale (pour voir immédiatement son propre trait)
      pointQueue.current.push(payload);

      // Envoyer sur le réseau pour les autres clients
      channel.send({ type: 'broadcast', event: 'draw', payload });
    };

    // ─────────────────────────────────────────────
    // 8. GESTIONNAIRES D'ÉVÉNEMENTS SOURIS
    // ─────────────────────────────────────────────
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

    // ─────────────────────────────────────────────
    // 9. GESTIONNAIRES D'ÉVÉNEMENTS TACTILES
    //    { passive: false } OBLIGATOIRE pour appeler preventDefault()
    //    preventDefault() OBLIGATOIRE pour bloquer le scroll/zoom du navigateur
    // ─────────────────────────────────────────────
    const onTouchStart = (e) => {
      e.preventDefault(); // bloque le scroll
      isDrawing.current = true;
      const touch = e.touches[0];
      sendPoint('start', touch.clientX, touch.clientY);
    };

    const onTouchMove = (e) => {
      e.preventDefault(); // bloque le zoom
      if (!isDrawing.current) return;
      const touch = e.touches[0];
      sendPoint('move', touch.clientX, touch.clientY);
    };

    const onTouchEnd = () => {
      if (!isDrawing.current) return;
      isDrawing.current = false;
      sendPoint('end');
    };

    // Attacher les événements
    window.addEventListener('mousedown',  onMouseDown);
    window.addEventListener('mousemove',  onMouseMove);
    window.addEventListener('mouseup',    onMouseUp);

    // passive: false est indispensable pour les événements tactiles
    window.addEventListener('touchstart', onTouchStart, { passive: false });
    window.addEventListener('touchmove',  onTouchMove,  { passive: false });
    window.addEventListener('touchend',   onTouchEnd);

    // ─────────────────────────────────────────────
    // 10. CLEANUP — indispensable en React
    //     Sans ça, les événements et le channel se dupliquent
    //     à chaque re-render ou fermeture du composant
    // ─────────────────────────────────────────────
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

  }, []); // [] → ce useEffect ne tourne qu'une seule fois au montage

  // ─────────────────────────────────────────────
  // 11. BOUTON CLEAR — efface et synchronise sur tous les clients
  // ─────────────────────────────────────────────
  const handleClear = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Envoyer l'ordre d'effacement aux autres clients
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'draw',
        payload: { type: 'clear' },
      });
    }
  },[] );

  // ─────────────────────────────────────────────
  // 12. RENDU JSX
  // ─────────────────────────────────────────────
  return (
    <>
      {/* Badge de statut */}
      <div className={`status-badge ${connStatus}`}>
        {connStatus === 'connected' ? `● Session : ${sessionId}` : '○ Connexion…'}
      </div>
      <QRPanel sessionId={sessionId} />

      {/* Canvas de dessin — prend tout l'écran */}
      <canvas
        ref={canvasRef}
        style={{ background: '#1a1a1a', width: '100vw', height: '100vh' }}
      />

      {/* Barre d'outils */}
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

        <button
           className="btn-clear"
           style={{
              background: eraserMode ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.05)',
              color: 'white',
              border: eraserMode ? '1px solid white' : '1px solid rgba(255,255,255,0.2)',
              marginRight: 8
            }}
           onClick={() => setEraserMode(!eraserMode)}
        >
           {eraserMode ? '✏️ Dessiner' : '◻️ Gomme'}
        </button>

<button className="btn-clear" onClick={handleClear}>
  🗑 Effacer
</button>

      </div>
    </>
  );
}

export default App;
