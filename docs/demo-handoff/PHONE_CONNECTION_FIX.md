# Expo Go connection repair — 25 September 2026

User report: Android, "Something went wrong", phone and computer on the same Wi-Fi.

## Findings

- Metro was running and listening on TCP 8081, and the computer still had Wi-Fi IPv4
  address 192.168.1.94. The old QR address itself had not changed.
- Windows classified WLAN as Public. An enabled inbound Public TCP **Block** rule
  targeted the exact Node executable running Metro. This obstructs phone connections
  even when a same-computer HTTP request succeeds.
- The initial Expo SDK 57 choice did not meet the assumed store-installed Expo Go
  compatibility. The project was aligned to SDK 54 using the official sdk-54 template.

## Applied repairs

- Expo 54.0.37, React Native 0.81.5, React 19.1.0, Expo Router 6.0.24, and matching
  native dependencies. No shipping/business or visual design changes were required.
- User-authorized administrator script created CASA-TE-Expo-LAN-8081, restricted to
  the exact Node executable, TCP 8081, RemoteAddress LocalSubnet, Public/Private profiles.
- Disabled only that executable's conflicting Public TCP block. Existing UDP blocking
  and firewall profile settings are unchanged.
- Original firewall rule names saved to .tools/expo-firewall-backup.json. Restore with
  scripts/enable-expo-lan.ps1 -Restore, run as administrator.
- start-demo.ps1 now selects an active default-gateway adapter to avoid VMware
  addresses and accepts an explicit -LanAddress override.

## Verification

- TypeScript check and 11 business tests passed.
- expo install --check passed. An additional scan of installed native packages against
  expo/bundledNativeModules.json found no version mismatches.
- The LAN manifest advertises SDK 54.0.0 and bundle host 192.168.1.94:8081 for both platforms.
- Android development bundle downloaded successfully: HTTP 200, 6,725,491 bytes.
- iOS development bundle downloaded successfully: HTTP 200, 6,733,341 bytes.
- These requests were made from this computer. Phone-side success requires the user's
  retry; computer-side downloads alone do not prove phone connectivity or native rendering.
- After Metro reloaded the new Babel config, the browser preview had no page errors and
  the full shopping-flow smoke test passed. The config transforms Zustand's `import.meta`
  usage for web, which had previously caused a blank browser preview. Mobile native bundle
  compilation remains unaffected by this web-only transform.

The Wi-Fi network changed during follow-up: its current IPv4 is 10.65.26.109. The old
192.168.1.94 QR was stale. Metro was restarted with a fresh QR at
exp://10.65.26.109:8081; use the QR in the current terminal session. The older
test-results/expo-go.png image must not be used. The IP can change again with the network.

## Follow-up after QR still failed

- Current network is Public, with inbound traffic blocked by default. Windows reports
  `LocalFirewallRules N/A (GPO-store only)`: an administrator-applied local allow rule
  is not merged into the organization-managed policy. The approved helper exited 0,
  but the rule is not present in the effective firewall rules.
- Expo's ngrok tunnel was tried twice and failed with `ngrok tunnel took too long to
  connect`. The package is installed locally for future retries, but the tunnel is not
  currently available from this network.
- ADB is installed, but no Android device is connected over USB. If USB debugging is
  enabled and the phone is authorized, `adb reverse tcp:8081 tcp:8081` is the next
  path to try; the Expo server must then run in localhost mode and the phone must use
  the matching localhost QR.
The development server must remain running and the devices must share a reachable network.

Reference: [Expo Go version compatibility](https://docs.expo.dev/troubleshooting/expo-go-version-mismatch/).
Install reported dependency advisories in the SDK 54 dependency tree; no forced breaking
upgrades were used during the compatibility repair. This remains a local development demo.
