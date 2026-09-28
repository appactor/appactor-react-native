# AppActor React Native

Server-authoritative in-app purchase infrastructure for React Native on iOS and Android.

This package mirrors the current AppActor Flutter SDK surface as closely as possible on top of the shared native AppActor plugin layer:

- React Native `0.85.3`
- iOS `16.0+`
- Android `minSdk 26`
- Native dependencies:
  - iOS `AppActorPlugin 0.2.1`
  - Android `com.appactor:appactor-plugin:2.4.3`

## Installation

```sh
npm install appactor-react-native
```

or

```sh
yarn add appactor-react-native
```

### iOS

`AppActorPlugin 0.2.1` requires up-to-date CocoaPods specs. After installing JS dependencies, run:

```sh
cd ios
pod install --repo-update
```

For day-to-day app runs, `yarn ios` is usually enough after the first successful `--repo-update`.

## Quick Start

```tsx
import {
  AppActor,
  AppActorAsaOptions,
  AppActorLogLevel,
  AppActorOptions,
} from 'appactor-react-native';

// Use the shared singleton instance. Direct construction is intentionally blocked.
// Optional: pass ASA settings directly, like Flutter's named `options:` payload.
AppActor.instance.enableSearchAdsTracking(
  new AppActorAsaOptions(true, false, true)
);

await AppActor.instance.configure('pk_YOUR_PUBLIC_API_KEY', {
  appUserId: 'user_123',
  options: new AppActorOptions(AppActorLogLevel.Debug),
});

await AppActor.instance.enableInstallReferrer();

const offerings = await AppActor.instance.getOfferings();
const result = await AppActor.instance.purchasePackage(
  offerings.current!.monthly!,
  { placement: 'onboarding_paywall' }
);

const customerInfo = result.customerInfo ?? (await AppActor.instance.getCustomerInfo());
const isPremium = customerInfo.hasActiveEntitlement('premium');
```

## Offerings & Experiments

```ts
// All offerings, or one by its offering key (the dashboard "lookup key")
const offerings = await AppActor.instance.getOfferings();
offerings.current;                          // the current offering
offerings.allOfferings;                     // AppActorOffering[], current first
offerings.getOffering('onboarding');        // by offeringKey
const onboarding = await AppActor.instance.getOffering('onboarding'); // fetch + lookup in one call

// Experiments — never null, so no null-checks
const paywall = await AppActor.instance.getExperiment('paywall_test');
if (paywall.isVariant('annual_first')) showAnnualFirst();
paywall.variantKey;                         // 'control', 'annual_first', … or null when not enrolled

const showOnboarding = (await AppActor.instance.getExperiment('has_onboard')).boolValue(true);
const title = (await AppActor.instance.getExperiment('onboarding_flow')).get('title') ?? 'Welcome';
```

## API Overview

The React Native SDK exposes the same major surfaces as Flutter:

- Lifecycle:
  `enableSearchAdsTracking()`, `configure()`, `reset()`, `sdkVersion()`, `setLogLevel()`, `enableInstallReferrer()`
- Identity:
  `logIn()`, `logOut()`, `getAppUserId()`, `getIsAnonymous()`
- Commerce:
  `purchasePackage()`, `restorePurchases()`, `syncPurchases()`, `quietSyncPurchases()`, `drainReceiptQueueAndRefreshCustomer()`
- Data and cache:
  `getCustomerInfo()`, `getOfferings()`, `getOffering()`, `getCachedOfferings()`, `getCachedRemoteConfigs()`, `getCachedCustomerInfo()`, `activeEntitlementKeysOffline()`, `getStorefront()`, `getStoreCapabilities()`
- Customer data:
  `setAttributes()`, `setAttribute()`, `unsetAttribute()`, `setEmail()`, `setDisplayName()`, `setPhoneNumber()`, `setPushToken()`, `collectDeviceIdentifiers()`
- Attribution and integrations:
  `setIntegrationIdentifier()`, `setCustomIntegrationIdentifier()`, `updateAttribution()`, `setMediaSource()`, `setCampaign()`, `setAdGroup()`, `setAd()`, `setKeyword()`, `setCreative()`
- Remote config and experiments:
  `getRemoteConfigs()`, `getExperiment()`, `getExperimentAssignment()`, `getRemoteConfig()`, `getRemoteConfigBool()`, `getRemoteConfigString()`, `getRemoteConfigNumber()`, `getRemoteConfigInt()`
- iOS-only helpers:
  `presentOfferCodeRedeemSheet()`, `getAsaDiagnostics()`, `getPendingAsaPurchaseEventCount()`, `getAsaFirstInstallOnDevice()`, `getAsaFirstInstallOnAccount()`, `purchaseFromIntent()`
- Diagnostics events:
  `onSdkLog`

## Purchase Sync Semantics

These three flows are intentionally different and should not be treated as aliases:

```ts
await AppActor.instance.syncPurchases();
await AppActor.instance.quietSyncPurchases(); // Deprecated alias of syncPurchases()
await AppActor.instance.drainReceiptQueueAndRefreshCustomer();
```

- `syncPurchases()` is the quiet store sync API.
- `quietSyncPurchases()` is kept for backward compatibility.
- `drainReceiptQueueAndRefreshCustomer()` is the explicit receipt-queue drain path.

## Customer Attributes

Use `setAttribute()` and `setAttributes()` only for developer-defined custom keys.

```ts
import {
  AppActor,
  AppActorAttributeValue,
  AppActorIntegrationIdentifier,
} from 'appactor-react-native';

await AppActor.instance.setAttributes({
  favorite_category: 'watch_faces',
  last_seen: new Date(),
  flags: AppActorAttributeValue.boolList([true, false]),
});

await AppActor.instance.setAttributes(
  new Map([
    ['favorite_category', 'watch_faces'],
    ['trial', true],
  ])
);

await AppActor.instance.setEmail('user@example.com');
await AppActor.instance.setDisplayName('Ada Lovelace');
await AppActor.instance.setIntegrationIdentifier(
  AppActorIntegrationIdentifier.AppsFlyerId,
  'af-user-123'
);
await AppActor.instance.setCampaign('spring_sale');
await AppActor.instance.setCampaign(null);
```

Important validation rules:

- Custom keys cannot be empty.
- Custom keys cannot exceed 64 characters.
- Custom keys cannot use `$`, `appactor.`, or `integration.` prefixes.
- Custom values cannot be `null`; use `unsetAttribute(key)` for deletion.
- Supported custom values are strings, finite numbers, booleans, flat primitive lists such as arrays or `Set`, and `Date` values.
- Attribute collections can be passed either as plain objects or iterable `[key, value]` entries such as `Map`.

More detail:

- [Customer attributes and profile context](docs/customer-attributes.md)

## Event Streams

Subscribe once and keep the returned subscription so you can remove it when the screen unmounts (except `onPurchaseIntent`, see [Purchase intents](#purchase-intents-ios)):

```ts
const customerSub = AppActor.instance.onCustomerInfoUpdated.listen((info) => {
  console.log('customer_info_updated', info.activeEntitlementKeys);
});

const receiptSub = AppActor.instance.onReceiptPipelineEvent.listen((event) => {
  console.log('receipt_pipeline_event', event.type, event.productId);
});

const deferredSub = AppActor.instance.onDeferredPurchaseResolved.listen((event) => {
  console.log('deferred_purchase_resolved', event.productId);
});

const sdkLogSub = AppActor.instance.onSdkLog.listen((event) => {
  console.log('sdk_log', event.level, event.category, event.message);
});

customerSub.remove();
receiptSub.remove();
deferredSub.remove();
sdkLogSub.remove();
```

`sdk_log` entries are also printed automatically in debug builds, matching Flutter's default diagnostics behavior. `onSdkLog` is for advanced tooling and custom inspection; production app flow should not depend on those events.

### Purchase intents (iOS)

On iOS 16.4+, purchases the user starts in the App Store (promoted in-app purchases, win-back offers) arrive through `onPurchaseIntent`, and nothing is bought until the app calls `purchaseFromIntent(intent)`. Register a listener that does so early, in your app's entry file before or right after `configure()`, and keep it for the app's lifetime. Don't tie it to a screen or remove it on unmount:

```ts
// App entry file, module scope
AppActor.instance.onPurchaseIntent.listen((intent) => {
  AppActor.instance
    .purchaseFromIntent(intent)
    .catch((error) => console.warn('purchaseFromIntent failed', error));
});
```

Intents that arrive while no `onPurchaseIntent` listener exists, for example during a cold launch from the App Store before your listener is registered, are held in memory and handed to the next listener. The hold lives in the JS context, so a JS reload loses it. An intent is forgotten five minutes after it arrived, and `reset()` drops held intents. Android never emits purchase intents.

## Platform Notes

- Call `enableSearchAdsTracking()` before `configure()` if you use Apple Search Ads attribution.
- Call `enableInstallReferrer()` after `configure()` on Android if you want Google Play Install Referrer collection.
- `getAppUserId()` returns `null` before configure, and `getIsAnonymous()` returns `true`.
- iOS-only APIs throw on non-iOS platforms.
- `getStorefront()` returns `null` on iOS and only queries the native store on Android, matching the current Flutter contract.
- Promoted purchase intents and `purchaseFromIntent()` require iOS `16.4+`.

## Example App

The repo includes a real example app in [`example/`](example) that exercises:

- auto-bootstrap configure, reset, and full snapshot refresh
- sdk version and identity reads
- login and logout
- attribution snapshot and nullable helper clear
- offerings and customer fetches
- structured customer/offering/config/ASA summaries plus raw JSON inspection
- restore, sync, quiet sync, and queue drain
- remote config and experiment reads
- offline entitlement keys and storefront reads
- purchase flow against current offering packages
- customer-info, receipt, deferred-purchase, and purchase-intent event streams
- ASA diagnostics, pending ASA helpers, and first-install checks on iOS
- offer-code redemption and promoted purchase intents on iOS

See [example/README.md](example/README.md) for exact setup steps.

## Development

```sh
yarn install
yarn typecheck
yarn test --runInBand
yarn prepare
```

## Internal Docs

- [Flutter parity implementation plan](docs/appactor-react-native-parity-plan.md)

## License

MIT
