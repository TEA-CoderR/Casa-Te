// Expo's default Metro config already supports npm workspaces (SDK 52+).
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// App code importing 'react-native' gets src/lib/rn.tsx: the same module with Text and TextInput capped at 1.3×
// the system font size. That file itself and every library keep the real 'react-native'.
const src = path.join(__dirname, 'src') + path.sep;
const shim = path.join(__dirname, 'src', 'lib', 'rn.tsx');
const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react-native' && context.originModulePath.startsWith(src) && context.originModulePath !== shim) {
    return { type: 'sourceFile', filePath: shim };
  }
  return (upstream ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
