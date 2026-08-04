import React from 'react';
import {Easing, Interactive, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {Backdrop} from '../components/Backdrop';
import {SceneHeader} from '../components/SceneHeader';
import {Terminal} from '../components/Terminal';

export const PrepareScene: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  return (
    <Backdrop>
      <SceneHeader step="Step 2 · Prepare" title="Invoke the skill before starting the goal" />
      <Terminal
        title="Codex prompt"
        style={{bottom: 54, left: 72, position: 'absolute', top: 174, width: 760}}
      >
        <div
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            fontSize: 24,
            lineHeight: 1.52,
            padding: '24px 28px',
          }}
        >
          <Interactive.Div
            name="Skill invocation"
            style={{
              color: '#ff746b',
              fontWeight: 800,
              opacity: interpolate(frame, [0.35 * fps, 0.6 * fps], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
            }}
          >
            $aim-for-the-head
          </Interactive.Div>
          <Interactive.Div
            name="Audit request"
            style={{
              color: '#e7ebf1',
              marginTop: 12,
              opacity: interpolate(frame, [0.65 * fps, 0.95 * fps], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
            }}
          >
            Prepare an authorized, report-only hunt.
          </Interactive.Div>
          <Interactive.Div
            name="Mode"
            style={{
              color: '#b7c0ce',
              opacity: interpolate(frame, [1.05 * fps, 1.3 * fps], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
            }}
          >
            <span style={{color: '#5cc8ff'}}>Mode:</span> discovery
          </Interactive.Div>
          <Interactive.Div
            name="Success"
            style={{
              color: '#b7c0ce',
              opacity: interpolate(frame, [1.35 * fps, 1.6 * fps], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
            }}
          >
            <span style={{color: '#5cc8ff'}}>Success:</span> 1 novel High/Critical finding
          </Interactive.Div>
          <Interactive.Div
            name="Tooling"
            style={{
              color: '#b7c0ce',
              opacity: interpolate(frame, [1.65 * fps, 1.9 * fps], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
            }}
          >
            <span style={{color: '#5cc8ff'}}>Tools:</span> Nemesis at /absolute/path
          </Interactive.Div>
          <Interactive.Div
            name="Budget"
            style={{
              color: '#b7c0ce',
              opacity: interpolate(frame, [1.95 * fps, 2.2 * fps], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
            }}
          >
            <span style={{color: '#5cc8ff'}}>Budget:</span> 8h or 50 experiments
          </Interactive.Div>
          <Interactive.Div
            name="Preparation instruction"
            style={{
              color: '#54e38e',
              fontSize: 21,
              marginTop: 14,
              opacity: interpolate(frame, [2.25 * fps, 2.55 * fps], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
            }}
          >
            Draft + validate the contract before hunting.
          </Interactive.Div>
        </div>
      </Terminal>
      <div style={{position: 'absolute', right: 72, top: 205, width: 320}}>
        {[
          ['01', 'Map attack surfaces'],
          ['02', 'Model threats'],
          ['03', 'Freeze evidence gates'],
          ['04', 'Show contract for approval'],
        ].map(([number, label], index) => (
          <Interactive.Div
            key={number}
            name={`Preparation ${number}`}
            style={{
              alignItems: 'center',
              backgroundColor: 'rgba(255,255,255,0.045)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 14,
              color: '#dfe5ed',
              display: 'flex',
              fontSize: 21,
              fontWeight: 650,
              gap: 14,
              marginBottom: 14,
              opacity: interpolate(frame, [(1.05 + index * 0.36) * fps, (1.35 + index * 0.36) * fps], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
              padding: '17px 18px',
              translate: interpolate(frame, [(1.05 + index * 0.36) * fps, (1.35 + index * 0.36) * fps], ['18px 0px', '0px 0px'], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
            }}
          >
            <span style={{color: '#ff746b', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'}}>
              {number}
            </span>
            {label}
          </Interactive.Div>
        ))}
      </div>
    </Backdrop>
  );
};
