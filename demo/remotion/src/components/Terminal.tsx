import React from 'react';

export const Terminal: React.FC<{
  children: React.ReactNode;
  title: string;
  style?: React.CSSProperties;
}> = ({children, title, style}) => {
  return (
    <div
      style={{
        backgroundColor: 'rgba(10,13,19,0.96)',
        border: '1px solid rgba(255,255,255,0.13)',
        borderRadius: 18,
        boxShadow: '0 28px 80px rgba(0,0,0,0.48)',
        overflow: 'hidden',
        ...style,
      }}
    >
      <div
        style={{
          alignItems: 'center',
          backgroundColor: 'rgba(255,255,255,0.045)',
          borderBottom: '1px solid rgba(255,255,255,0.09)',
          display: 'flex',
          height: 46,
          padding: '0 18px',
        }}
      >
        <div style={{backgroundColor: '#ff5f57', borderRadius: 9, height: 12, marginRight: 8, width: 12}} />
        <div style={{backgroundColor: '#febc2e', borderRadius: 9, height: 12, marginRight: 8, width: 12}} />
        <div style={{backgroundColor: '#28c840', borderRadius: 9, height: 12, width: 12}} />
        <div
          style={{
            color: '#77808f',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            fontSize: 15,
            marginLeft: 18,
          }}
        >
          {title}
        </div>
      </div>
      {children}
    </div>
  );
};
