import React from 'react';
import {Easing, Interactive, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {Backdrop} from '../components/Backdrop';

export const IntroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  return (
    <Backdrop>
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          flexDirection: 'column',
          inset: 0,
          justifyContent: 'center',
          padding: '70px 90px',
          position: 'absolute',
          textAlign: 'center',
        }}
      >
        <Interactive.Div
          name="Crosshair mark"
          style={{
            alignItems: 'center',
            border: '4px solid #ff4d43',
            borderRadius: 999,
            color: '#ff4d43',
            display: 'flex',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            fontSize: 32,
            fontWeight: 900,
            height: 78,
            justifyContent: 'center',
            marginBottom: 26,
            opacity: interpolate(frame, [0, 0.4 * fps], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            scale: interpolate(frame, [0, 0.55 * fps], [0.65, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
              easing: Easing.spring({damping: 200}),
              output: 'perceptual-scale',
            }),
            width: 78,
          }}
        >
          +
        </Interactive.Div>
        <Interactive.Div
          name="Main title"
          style={{
            color: '#f7f8fa',
            fontSize: 82,
            fontWeight: 850,
            letterSpacing: -4,
            lineHeight: 0.98,
            opacity: interpolate(frame, [0.25 * fps, 0.75 * fps], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            translate: interpolate(frame, [0.25 * fps, 0.75 * fps], ['0px 24px', '0px 0px'], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          Aim for the Head
        </Interactive.Div>
        <Interactive.Div
          name="Subtitle"
          style={{
            color: '#aeb6c5',
            fontSize: 30,
            fontWeight: 520,
            lineHeight: 1.35,
            marginTop: 22,
            maxWidth: 900,
            opacity: interpolate(frame, [0.65 * fps, 1.15 * fps], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          From an authorized codebase to an evidence-backed security outcome.
        </Interactive.Div>
        <Interactive.Div
          name="Command pairing"
          style={{
            backgroundColor: 'rgba(255,77,67,0.11)',
            border: '1px solid rgba(255,77,67,0.38)',
            borderRadius: 999,
            color: '#ff827a',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            fontSize: 23,
            fontWeight: 700,
            marginTop: 34,
            opacity: interpolate(frame, [1.05 * fps, 1.45 * fps], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            padding: '13px 22px',
          }}
        >
          $aim-for-the-head&nbsp;&nbsp;+&nbsp;&nbsp;/goal
        </Interactive.Div>
      </div>
    </Backdrop>
  );
};
