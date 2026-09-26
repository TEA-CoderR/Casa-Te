import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const base = new URL(process.argv[2] || 'http://192.168.1.94:8081');
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const expoMajor = packageJson.dependencies.expo.match(/\d+/)?.[0];
assert.ok(expoMajor, 'Could not read the Expo SDK version from package.json');
const expectedSdk = `${expoMajor}.0.0`;
const status = await fetch(new URL('/status', base), { signal: AbortSignal.timeout(10000) });
assert.equal(status.status, 200);
assert.match(await status.text(), /packager-status:running/);
for (const platform of ['android', 'ios']) {
  const response = await fetch(base, {
    headers: { 'expo-platform': platform, accept: 'application/expo+json' },
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status, 200);
  const manifest = await response.json();
  const sdk = manifest.extra?.expoClient?.sdkVersion;
  assert.equal(sdk, expectedSdk, 'Manifest must match the project Expo SDK');
  const bundleUrl = new URL(manifest.launchAsset.url);
  assert.equal(bundleUrl.hostname, base.hostname, 'A phone must receive a reachable LAN bundle URL');
  const bundle = await fetch(bundleUrl, { signal: AbortSignal.timeout(180000) });
  const body = await bundle.arrayBuffer();
  assert.equal(bundle.status, 200, `${platform} bundle failed`);
  assert.ok(body.byteLength > 10000);
  console.log(JSON.stringify({ platform, sdk, bundleHost: bundleUrl.host, bundleStatus: bundle.status, bytes: body.byteLength }));
}
console.log('PASS: LAN manifest and Android/iOS development bundles can be downloaded from this computer. Phone-side confirmation is still required.');
