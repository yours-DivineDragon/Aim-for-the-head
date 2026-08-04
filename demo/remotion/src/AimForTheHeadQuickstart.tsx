import React from 'react';
import {TransitionSeries, linearTiming} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {ActivateScene} from './scenes/ActivateScene';
import {InstallScene} from './scenes/InstallScene';
import {IntroScene} from './scenes/IntroScene';
import {PrepareScene} from './scenes/PrepareScene';
import {ReviewScene} from './scenes/ReviewScene';

export const AimForTheHeadQuickstart: React.FC = () => {
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={60} name="Introduction">
        <IntroScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({durationInFrames: 10})}
      />
      <TransitionSeries.Sequence durationInFrames={84} name="Install and verify">
        <InstallScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({durationInFrames: 10})}
      />
      <TransitionSeries.Sequence durationInFrames={108} name="Prepare the hunt">
        <PrepareScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({durationInFrames: 10})}
      />
      <TransitionSeries.Sequence durationInFrames={84} name="Review the contract">
        <ReviewScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({durationInFrames: 10})}
      />
      <TransitionSeries.Sequence durationInFrames={96} name="Activate the goal">
        <ActivateScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};
