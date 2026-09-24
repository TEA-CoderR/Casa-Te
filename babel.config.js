module.exports = function (api) {
  api.cache(true);
  return {
    // Zustand's ESM middleware uses import.meta; SDK 54 web bundles need this transform.
    presets: [['babel-preset-expo', { web: { unstable_transformImportMeta: true } }]],
  };
};
