// Extends app.json. EXPO_BASE_URL serves the web shop from a sub-path (e.g. /Casa-Te on GitHub Pages).
module.exports = ({ config }) => ({
  ...config,
  experiments: { ...config.experiments, ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}) },
});
