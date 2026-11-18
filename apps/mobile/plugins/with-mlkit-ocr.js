// The text reader of "Fotografa un prodotto" (expo-text-extractor) uses ML Kit from Google Play services: its model
// is downloaded by the phone. This asks Play to fetch it when the app is installed, so the first photo already works.
const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

module.exports = function withMlkitOcr(config) {
  return withAndroidManifest(config, (c) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(c.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(app, 'com.google.mlkit.vision.DEPENDENCIES', 'ocr');
    return c;
  });
};
