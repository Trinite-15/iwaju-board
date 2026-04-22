import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

function QRPanel({ sessionId }) {
  const mobileUrl = `http://192.168.1.100:5173/?session=${sessionId}`;

  return (
    <div style={{
      position: 'fixed',
      top: 16,
      left: 16,
      background: 'rgba(20,20,20,0.9)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 12,
      padding: 16,
      zIndex: 200,
      textAlign: 'center',
    }}>
      <QRCodeSVG value={mobileUrl} size={128} bgColor="#141414" fgColor="#ffffff" />
      <p style={{ color: '#888', fontSize: 10, margin: '8px 0 0', fontFamily: 'monospace' }}>
        Scanne avec ton téléphone
      </p>
      <p style={{ color: '#555', fontSize: 9, margin: '4px 0 0', fontFamily: 'monospace' }}>
        Session : {sessionId}
      </p>
    </div>
  );
}

export default QRPanel;
