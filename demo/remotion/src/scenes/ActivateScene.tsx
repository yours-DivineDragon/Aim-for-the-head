import React from 'react';
import {Easing, Interactive, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {Backdrop} from '../components/Backdrop';
import {SceneHeader} from '../components/SceneHeader';
import {Terminal} from '../components/Terminal';

export const ActivateScene: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  return (
    <Backdrop>
      <SceneHeader step="Step 4 · Activate" title="Let persistence carry the contract" />
      <Terminal
        title="Codex goal"
        style={{left: 72, position: 'absolute', right: 72, top: 178}}
      >
        <div
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            fontSize: 25,
            lineHeight: 1.48,
            padding: '24px 30px 27px',
          }}
        >
          <Interactive.Div
            name="Goal command"
            style={{
              color: '#ff746b',
              fontWeight: 800,
              opacity: interpolate(frame, [0.35 * fps, 0.65 * fps], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
            }}
          >
            /goal Using $aim-for-the-head,
          </Interactive.Div>
          <Interactive.Div
            name="Goal contract"
            style={{
              color: '#e7ebf1',
              opacity: interpolate(frame, [0.7 * fps, 1.0 * fps], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
              paddingLeft: 24,
            }}
          >
            execute the approved .goal-hunt/GOAL.md contract;
          </Interactive.Div>
          <Interactive.Div
            name="Goal tool instruction"
            style={{
              color: '#e7ebf1',
              opacity: interpolate(frame, [1.05 * fps, 1.35 * fps], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
              paddingLeft: 24,
            }}
          >
            explicitly invoke relevant tools and preserve evidence;
          </Interactive.Div>
          <Interactive.Div
            name="Goal terminal instruction"
            style={{
              color: '#e7ebf1',
              opacity: interpolate(frame, [1.4 * fps, 1.7 * fps], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
              paddingLeft: 24,
            }}
          >
            stop only after the terminal check passes.
          </Interactive.Div>
        </div>
      </Terminal>
      <div
        style={{
          display: 'flex',
          gap: 13,
          justifyContent: 'center',
          left: 72,
          position: 'absolute',
          right: 72,
          top: 478,
        }}
      >
        {['validated', 'exhausted', 'budget-limited', 'blocked'].map((outcome, index) => (
          <Interactive.Div
            key={outcome}
            name={`Outcome ${outcome}`}
            style={{
              backgroundColor: outcome === 'validated' ? 'rgba(84,227,142,0.10)' : 'rgba(255,255,255,0.045)',
              border: outcome === 'validated' ? '1px solid rgba(84,227,142,0.43)' : '1px solid rgba(255,255,255,0.12)',
              borderRadius: 999,
              color: outcome === 'validated' ? '#71eda1' : '#aeb7c5',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              fontSize: 18,
              fontWeight: 750,
              opacity: interpolate(frame, [(1.75 + index * 0.22) * fps, (2.02 + index * 0.22) * fps], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
              padding: '11px 17px',
            }}
          >
            {outcome}
          </Interactive.Div>
        ))}
      </div>
      <Interactive.Div
        name="Completion principle"
        style={{
          bottom: 52,
          color: '#f4f6f9',
          fontSize: 25,
          fontWeight: 720,
          left: 72,
          opacity: interpolate(frame, [2.7 * fps, 3.1 * fps], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          position: 'absolute',
          right: 72,
          textAlign: 'center',
        }}
      >
        Persistence carries the objective. <span style={{color: '#ff746b'}}>Evidence decides completion.</span>
      </Interactive.Div>
    </Backdrop>
  );
};
