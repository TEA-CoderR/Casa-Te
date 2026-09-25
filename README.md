# CASA & TE Mobile App — Codex Handoff Package

## Commercial launch program

This repository is still a **demo**, not a production commerce service. The approved direction is a self-operated Italian department-store pilot with both home delivery and store pickup. See [the commercial launch plan](COMMERCIAL_LAUNCH_PLAN.md), [enterprise integration request](INTEGRATION_DISCOVERY.md), and [first-party research](RETAIL_PRODUCTION_RESEARCH.md). Real product, inventory, payment, fulfilment and identity systems must replace the demo flows before customer sales. CI validates the mobile app and demo service; production mode refuses to use the unauthenticated demo order service.

The first interface-first mock commerce slice is documented in [MOCK_COMMERCE.md](MOCK_COMMERCE.md). It runs in parallel with the existing phone demo and does not create paid orders.

## Runnable demo — September 25, 2026

The native UI has since been redesigned. See `UI_REDESIGN.md` for the updated screens,
generated demo assets, phone preview and validation. Current screenshots are under
`test-results/app-*.png`; `test-results/expo-go.png` is the session's phone preview QR.

This directory is now a configured Expo SDK 57 project for the installed Expo Go. Dependencies are installed;
do not create another Expo project or run the original bootstrap instructions below.

From PowerShell in this directory:

```powershell
.\start-demo.ps1
```

Scan the terminal QR code with an Expo Go version supporting SDK 57, with the phone
and computer on the same network. Use `./start-demo.ps1 -Web` for a browser preview.
The native Android bundle and Expo Go UI run in the local emulator; physical-device and iOS acceptance are still pending.

On a clean machine with Node.js and npm, run `npm ci` once, then `npm start`.
Standard checks: `npm run typecheck`, `npm test`, `npx expo install --check`,
and `npx expo export --platform all --max-workers 2`.

Browser integration test: with Expo running on port 8081 and Playwright plus Microsoft
Edge installed, run `node tests/smoke.cjs`. An optional first argument supplies a path
to an existing Playwright module. Screenshots are written to `test-results/`.

The demo uses local placeholder products and simulated payments. Shipping rules are
unchanged, including the provisional fallback above 10 kg. Home delivery asks for demo
address information; pickup points are explicitly simulated. Store preferences, cart,
and orders persist locally. See `IMPLEMENTATION_REPORT.md` for scope and validation.

The remaining sections are the original handoff instructions, retained for context.

### Phone connection repair

The first SDK 57 setup was temporarily replaced with SDK 54 during connection diagnosis.
The project was later restored to SDK 57 to match the installed Expo Go; package.json
is the source of truth for the current SDK version.
Windows also had a Public-network TCP block for the Node runtime running Expo.
The authorized repair allows only that runtime's TCP 8081 from LocalSubnet and
disables its conflicting Public TCP block. UDP rules and firewall profiles are unchanged.
To undo the firewall repair, run `./scripts/enable-expo-lan.ps1 -Restore` as administrator.
`start-demo.ps1` selects the adapter with a default gateway to avoid VMware-only addresses;
you can supply `-LanAddress 192.168.1.94` explicitly when necessary.
Connection diagnostic: `node scripts/check-phone-preview.mjs http://192.168.1.94:8081`.

This package is designed so Codex can understand the full project context without access to the previous ChatGPT conversation.

## Fastest path

1. Create/open the Expo project locally.
2. Copy this package into the project root.
3. Open Codex in the project root.
4. Give Codex this exact instruction:

```text
Read CODEX_MASTER_PROMPT.md and execute it.
```

Codex should then read the project context/specification files and begin implementation.

---

# CASA & TE Mobile App — Starter v0.1

This folder is an **Expo + React Native + TypeScript source overlay** for the CASA & TE mobile demo.

## 1) Create the real Expo project

Open PowerShell in the folder where you want the project:

```powershell
npx create-expo-app@latest CASA_TE_App
cd CASA_TE_App
npm install zustand @react-native-async-storage/async-storage
```

Expo's default template currently includes Expo Router and TypeScript.

## 2) Copy this starter overlay into the Expo project

Copy:
- `src/` → `CASA_TE_App/src/`
- `assets/logo.png` → `CASA_TE_App/assets/logo.png`
- `AGENTS.md` → `CASA_TE_App/AGENTS.md`
- `CODEX_TASKS.md` → `CASA_TE_App/CODEX_TASKS.md`

If the generated Expo project already contains `app/` or `src/app/` demo files, replace the route files with this starter.

## 3) Run on your phone

```powershell
npx expo start
```

Install **Expo Go** on iOS/Android and scan the QR code.

## 4) What works in this starter

- Native bottom tabs
- Home page
- Product catalogue
- Product details
- Cart with quantities
- Automatic order weight calculation
- CASA & TE shipping rules
- Checkout
- Delivery methods:
  - Home delivery
  - Pickup point / locker
  - Store pickup
- €66 free-shipping logic for <=10kg
- Mock order confirmation
- Local cart persistence
- Order history screen

## 5) Demo scope

This version intentionally does NOT connect:
- real payment
- Packlink / Sendcloud
- POS / ERP inventory
- member card
- login
- production database

Those are Phase 2 after management approves the demo.
# Live order admin demo

The mobile app and browser console now share a local demo order service. Open two PowerShell terminals in this project:

1. Run `./start-admin.ps1` and open `http://localhost:8787` on the computer.
2. Run `./start-demo.ps1`, then open the mobile app in Expo Go. On Android Emulator with Metro on localhost, run `adb reverse tcp:8787 tcp:8787` if the helper did not find `adb`.
3. Confirm a demo order in the app. The browser console updates automatically, usually within 1.2 seconds. The app only shows success after the service accepts the order.

For a physical phone, connect it and the computer to the same Wi-Fi. The service listens on port 8787; permit this port through the computer firewall if necessary. `start-demo.ps1` sets `EXPO_PUBLIC_ORDER_API_URL` from the detected LAN address. If detection chooses the wrong address, pass `-LanAddress 192.168.x.x`. The demo service has no login and is intended only for a trusted local network with fictional customer details. Orders persist in the ignored `demo-data/orders.json`; old phone-only orders remain in AsyncStorage and are not silently uploaded.
