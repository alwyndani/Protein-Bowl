# Protein Bowl mobile - build guide

Customer app only (Expo SDK 52, React Native 0.76.9, React 18.3.1). No `android/` or `ios/` directory is committed; native projects are generated (Continuous Native Generation). `react-native-razorpay` and `expo-dev-client` are native modules, so Expo Go cannot run payments: use a development, preview or production build.

## Identifiers (in `app.config.ts`)
| Item | Value |
|---|---|
| App name / slug | Protein Bowl / `protein-bowl-mobile` |
| Android package | `com.proteinbowl.app` |
| iOS bundle identifier | `com.proteinbowl.app` |
| Version | `1.0.0` (`version` in `app.config.ts`; must be MAJOR.MINOR.PATCH or the app refuses to start) |
| EAS owner / project | `protein-bowl` / projectId `4ee27846-4698-4894-8f71-2d8f7be6c4bf` |

## Values the owner must supply
1. **`EXPO_PUBLIC_API_URL`**: the real HTTPS API base including `/api/v1` (for example `https://api.<your-domain>/api/v1`). Not committed anywhere, on purpose. Set it as an EAS environment variable (`eas env:create` or the expo.dev project settings) for the `preview` and `production` environments, or export it in the shell for a local build. Release builds reject `http://` and a missing value (both `app.config.ts` and `src/config/appConfig.ts`).
2. **Expo account** that owns `@protein-bowl/protein-bowl-mobile` (or change `owner` / `projectId` to yours with `eas init`).
3. **Google Play developer account** and an Android upload keystore (EAS can generate and store one at first build) - production AAB.
4. **Apple Developer Program membership**, App Store Connect app record for `com.proteinbowl.app`, and (for `preview` internal iOS builds) registered test devices.
5. **Branding assets**: no icon, splash or adaptive icon exist and none were invented. Store submission needs at least `icon` (1024x1024 PNG) and an Android `adaptiveIcon`; add them to `app.config.ts`, then update the `static.test.ts` guard that currently forbids those keys.
6. **Backend**: `MOBILE_MIN_APP_VERSION` and the Razorpay LIVE key configuration live on the server; the app holds no payment secret. Live payments need the owner's explicit decision.
7. **Store listing items** (not in this repo): privacy policy URL, App Privacy / Data Safety answers (account email, name, phone, address, health profile, order history are collected and sent to the Protein Bowl API; no third-party tracking SDK is present), support URL, screenshots.

## Build profiles (`eas.json`, no credentials inside)
- `development`: dev client, internal distribution, Android APK, `EXPO_PUBLIC_APP_ENV=development` (http API URL allowed, e.g. `http://10.0.2.2:5000/api/v1` for the Android emulator).
- `preview`: release-style, internal distribution, Android APK, treated as production (https required).
- `production`: store distribution, Android AAB, iOS store build, https required.

## EAS (cloud) steps
```
cd apps/mobile
npm ci
npx eas-cli login                       # your Expo account
npx eas-cli build:configure             # only if the project link needs repair
# Android
npx eas-cli build --platform android --profile preview       # installable APK for testers
npx eas-cli build --platform android --profile production    # AAB for Play Console
# iOS
npx eas-cli device:create                                    # only for internal (preview) iOS builds
npx eas-cli build --platform ios --profile preview
npx eas-cli build --platform ios --profile production        # prompts for Apple login / credentials
```
Submit manually (Play Console upload of the AAB, App Store Connect via Transporter or `eas submit` once you have configured it yourself).

## Local build (no EAS)
Requires Android Studio / JDK 17 (Android) or macOS with Xcode (iOS).
```
cd apps/mobile
npm ci
export EXPO_PUBLIC_APP_ENV=production
export EXPO_PUBLIC_API_URL=https://api.<your-domain>/api/v1
npx expo prebuild --clean
npx expo run:android --variant release     # or open ios/ in Xcode and Archive
```
`prebuild` output (`android/`, `ios/`) must not be committed (a test enforces this).

## Pre-release checks
```
cd apps/mobile
npx tsc --noEmit
npx jest --forceExit
npx expo config --type public     # confirms the config resolves (needs EXPO_PUBLIC_APP_ENV=production and an https EXPO_PUBLIC_API_URL to exercise the release path)
```
Permissions: no extra permission is declared by the app; the Razorpay SDK contributes INTERNET and the UPI intent `<queries>` on Android; iOS declares `LSApplicationQueriesSchemes` (tez, phonepe, paytmmp). No camera, location, contacts, or photo access is used. If you later add a SDK that touches required-reason APIs, check Apple's privacy manifest requirements (SDK 52 and Expo modules ship their own manifests).

## Not verified in this repository session
- No Android or iOS build was run; no device, emulator, or simulator was used; no Apple or Google account, EAS login, or network access was involved.
- Native payment (Razorpay) behaviour on a real device, UPI app hand-off, and the live payment path are unverified.
- Store requirements (icon sizes, privacy manifest completeness of third-party SDKs, Data Safety answers) have only been reviewed statically.
- Unit/integration tests run against jest-expo with a fake backend, not the real API.
