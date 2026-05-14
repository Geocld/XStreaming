import React from 'react';
import {NativeStreamScreenBase} from './NativeStream';

function NativePortraitStreamScreen(props: any) {
  return <NativeStreamScreenBase {...props} portraitMode={true} />;
}

export default NativePortraitStreamScreen;
