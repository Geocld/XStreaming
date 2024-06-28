import {createStore} from 'redux';

const initialState = {
  isLogined: false,
  streamingTokens: {},
  webToken: {},
  authentication: null,
  redirect: {},
  profile: {},
};

const reducer = (state = initialState, action: any) => {
  switch (action.type) {
    case 'SET_STREAMING_TOKEN':
      return {...state, streamingTokens: action.payload};
    case 'SET_WEB_TOKEN':
      return {...state, webToken: action.payload};
    case 'SET_AUTHENTICATION':
      return {...state, authentication: action.payload};
    case 'SET_REDIRECT':
      return {...state, redirect: action.payload};
    case 'SET_PROFILE':
      return {...state, profile: action.payload};
    case 'SET_LOGIN':
      return {...state, isLogined: action.payload};
    default:
      return state;
  }
};

const store = createStore(reducer);

export default store;
