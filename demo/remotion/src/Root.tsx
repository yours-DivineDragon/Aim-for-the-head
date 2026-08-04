import React from 'react';
import {Composition} from 'remotion';
import {AimForTheHeadQuickstart} from './AimForTheHeadQuickstart';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="AimForTheHeadQuickstart"
      component={AimForTheHeadQuickstart}
      durationInFrames={392}
      fps={24}
      width={1280}
      height={720}
    />
  );
};
