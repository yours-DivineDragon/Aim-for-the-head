import React from 'react';
import {AbsoluteFill} from 'remotion';

export const Backdrop: React.FC<{children: React.ReactNode}> = ({children}) => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#07090d',
        backgroundImage:
          'radial-gradient(circle at 78% 18%, rgba(255,59,48,0.16), transparent 28%), radial-gradient(circle at 12% 88%, rgba(92,200,255,0.10), transparent 30%), linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
        backgroundSize: 'auto, auto, 40px 40px, 40px 40px',
        color: '#f5f7fb',
        fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          boxShadow: 'inset 0 0 120px rgba(0,0,0,0.7)',
        }}
      />
      {children}
    </AbsoluteFill>
  );
};
