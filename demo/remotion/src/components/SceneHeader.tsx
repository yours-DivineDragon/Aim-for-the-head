import React from 'react';
import {Easing, Interactive, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';

export const SceneHeader: React.FC<{step: string; title: string}> = ({step, title}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  return (
    <div style={{position: 'absolute', left: 72, right: 72, top: 52}}>
      <Interactive.Div
        name="Step label"
        style={{
          color: '#ff6b61',
          fontSize: 19,
          fontWeight: 800,
          letterSpacing: 2.4,
          opacity: interpolate(frame, [0, 0.25 * fps], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          textTransform: 'uppercase',
        }}
      >
        {step}
      </Interactive.Div>
      <Interactive.Div
        name="Scene title"
        style={{
          color: '#f7f8fa',
          fontSize: 50,
          fontWeight: 780,
          letterSpacing: -1.8,
          lineHeight: 1.04,
          marginTop: 10,
          opacity: interpolate(frame, [0.08 * fps, 0.42 * fps], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [0.08 * fps, 0.42 * fps], ['0px 16px', '0px 0px'], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        {title}
      </Interactive.Div>
    </div>
  );
};
