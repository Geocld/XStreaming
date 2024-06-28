import {logger, consoleTransport} from 'react-native-logs';

export const debugFactory = (namespace: string) => {
  const config = {
    transport: consoleTransport,
    transportOptions: {
      colors: {
        debug: 'blueBright',
        info: 'greenBright',
        warn: 'yellowBright',
        error: 'redBright',
      },
    },
    enabledExtensions: [namespace],
  };
  const rootLog = logger.createLogger(config);
  const log = rootLog.extend(namespace);
  return log;
};
