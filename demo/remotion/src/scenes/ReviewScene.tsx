import React from 'react';
import {Easing, Interactive, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {Backdrop} from '../components/Backdrop';
import {SceneHeader} from '../components/SceneHeader';

export const ReviewScene: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  return (
    <Backdrop>
      <SceneHeader step="Step 3 · Review" title="Approve the contract—not a vague bug hunt" />
      <div
        style={{
          display: 'grid',
          gap: 22,
          gridTemplateColumns: 'repeat(3, 1fr)',
          left: 72,
          position: 'absolute',
          right: 72,
          top: 215,
        }}
      >
        {[
          ['GOAL.md', 'Outcome · scope · stop rules'],
          ['THREAT_MODEL.md', 'Attacker · assets · invariants'],
          ['contract.json', 'Gates · budget · evidence'],
        ].map(([file, detail], index) => (
          <Interactive.Div
            key={file}
            name={file}
            style={{
              backgroundColor: index === 0 ? 'rgba(255,77,67,0.10)' : 'rgba(255,255,255,0.045)',
              border: index === 0 ? '1px solid rgba(255,77,67,0.45)' : '1px solid rgba(255,255,255,0.12)',
              borderRadius: 18,
              minHeight: 176,
              opacity: interpolate(frame, [(0.45 + index * 0.34) * fps, (0.78 + index * 0.34) * fps], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
              padding: '27px 25px',
              translate: interpolate(frame, [(0.45 + index * 0.34) * fps, (0.78 + index * 0.34) * fps], ['0px 18px', '0px 0px'], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
            }}
          >
            <div
              style={{
                color: index === 0 ? '#ff746b' : '#5cc8ff',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                fontSize: 27,
                fontWeight: 800,
              }}
            >
              {file}
            </div>
            <div style={{color: '#9fa9b9', fontSize: 20, lineHeight: 1.4, marginTop: 17}}>{detail}</div>
            <div style={{color: '#54e38e', fontSize: 20, fontWeight: 750, marginTop: 20}}>✓ reviewed</div>
          </Interactive.Div>
        ))}
      </div>
      <Interactive.Div
        name="Activation warning"
        style={{
          backgroundColor: 'rgba(255,176,32,0.10)',
          border: '1px solid rgba(255,176,32,0.42)',
          borderRadius: 14,
          bottom: 62,
          color: '#ffd17a',
          fontSize: 23,
          fontWeight: 700,
          left: 72,
          opacity: interpolate(frame, [1.65 * fps, 2.05 * fps], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          padding: '17px 22px',
          position: 'absolute',
          right: 72,
          textAlign: 'center',
        }}
      >
        Pin the revision. Confirm authorization. Review every evidence gate. Then activate.
      </Interactive.Div>
    </Backdrop>
  );
};
