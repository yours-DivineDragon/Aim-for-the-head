import React from 'react';
import {Easing, Interactive, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {Backdrop} from '../components/Backdrop';
import {SceneHeader} from '../components/SceneHeader';
import {Terminal} from '../components/Terminal';

export const InstallScene: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  return (
    <Backdrop>
      <SceneHeader step="Step 1 · Install once" title="Open Codex inside the codebase" />
      <Terminal
        title="terminal — /path/to/codebase"
        style={{left: 72, position: 'absolute', right: 72, top: 174}}
      >
        <div
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            fontSize: 23,
            lineHeight: 1.52,
            padding: '24px 30px 28px',
          }}
        >
          <Interactive.Div
            name="Create skills directory"
            style={{
              color: '#dbe1ea',
              opacity: interpolate(frame, [0.35 * fps, 0.6 * fps], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
            }}
          >
            <span style={{color: '#54e38e'}}>$</span> mkdir -p "$HOME/.agents/skills"
          </Interactive.Div>
          <Interactive.Div
            name="Clone skill"
            style={{
              color: '#dbe1ea',
              opacity: interpolate(frame, [0.75 * fps, 1.05 * fps], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
            }}
          >
            <span style={{color: '#54e38e'}}>$</span> git clone \
          </Interactive.Div>
          <Interactive.Div
            name="Clone source and destination"
            style={{
              color: '#b8c0cd',
              opacity: interpolate(frame, [0.9 * fps, 1.2 * fps], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
              paddingLeft: 26,
            }}
          >
            <div>https://github.com/yours-DivineDragon/Aim-for-the-head.git \</div>
            <div>"$HOME/.agents/skills/aim-for-the-head"</div>
          </Interactive.Div>
          <Interactive.Div
            name="Enter target repository"
            style={{
              color: '#dbe1ea',
              opacity: interpolate(frame, [1.35 * fps, 1.65 * fps], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
            }}
          >
            <span style={{color: '#54e38e'}}>$</span> cd /path/to/codebase
          </Interactive.Div>
          <Interactive.Div
            name="Launch Codex"
            style={{
              color: '#dbe1ea',
              opacity: interpolate(frame, [1.65 * fps, 1.95 * fps], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
            }}
          >
            <span style={{color: '#54e38e'}}>$</span> codex
          </Interactive.Div>
          <Interactive.Div
            name="Verify skill"
            style={{
              color: '#5cc8ff',
              opacity: interpolate(frame, [2.0 * fps, 2.3 * fps], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
            }}
          >
            &gt; /skills&nbsp;&nbsp;&nbsp; ✓ aim-for-the-head
          </Interactive.Div>
        </div>
      </Terminal>
      <Interactive.Div
        name="Install note"
        style={{
          bottom: 48,
          color: '#929cad',
          fontSize: 20,
          left: 72,
          opacity: interpolate(frame, [2.25 * fps, 2.55 * fps], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          position: 'absolute',
        }}
      >
        User-wide install: available to every repository without modifying the target.
      </Interactive.Div>
    </Backdrop>
  );
};
