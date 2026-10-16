const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Lesson sources/assets are shared with authoring, outside mobile/.
config.watchFolders = [
  ...config.watchFolders,
  path.resolve(__dirname, '../content'),
  path.resolve(__dirname, '../assets'),
];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  ...config.resolver.nodeModulesPaths,
];

module.exports = config;
