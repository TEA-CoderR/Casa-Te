// Expo's default Metro config already supports npm workspaces (SDK 52+).
const { getDefaultConfig } = require('expo/metro-config');
module.exports = getDefaultConfig(__dirname);
