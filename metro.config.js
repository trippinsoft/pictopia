const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

/** @type {import('expo/metro-config').MetroConfig} */
// eslint-disable-next-line no-undef
const config = getDefaultConfig(__dirname);

config.cacheStores = ({ FileStore }) => [
new FileStore({
  root: '.metro-cache',
}),
];

config.cacheVersion = '1';

module.exports = withNativeWind(config, { input: './global.css' });