# AppActor React Native Parity Plan

## Goal

Build a React Native SDK in this repository that matches the current Flutter SDK behavior and surface area as closely as possible, using the native hybrid plugin layer as the execution backend:

- Flutter source of truth: `/Users/ercan/Desktop/appactor/appactor_flutter`
- iOS native bridge source of truth: `/Users/ercan/Desktop/appactor/appactor-ios`
- Android native bridge source of truth: `/Users/ercan/Desktop/appactor/appactor-android`
- Target repository: `/Users/ercan/Desktop/appactor/appactor_react-native`

The final delivery is not "a working wrapper". It is "a React Native package that covers the same public API, models, event surface, platform-specific behavior, example flows, and validation semantics that Flutter currently exposes."

## Current State Snapshot

- The target GitHub repository cloned into this folder is currently empty.
- Flutter package version is `0.0.16`.
- Flutter currently pins:
  - iOS pod `AppActorPlugin` `0.1.8`
  - Android Maven artifact `com.appactor:appactor-plugin:2.3.7`
- Live npm registry check in this run returned `react-native` version `0.85.3`.
- `create-react-native-library` live npm version check returned `0.62.0`.

## Audit Findings To Preserve During RN Implementation

### Confirmed parity-sensitive behaviors

- Flutter `configure()` is intentionally not deduped. Repeated calls still dispatch native `configure` again, and if ASA was armed on iOS, ASA enable is re-dispatched too.
- Before `configure()`, Flutter integration expectations are:
  - `getAppUserId()` returns `null`
  - `getIsAnonymous()` returns `true`
- Flutter attribute helper state is reset on `logIn()`, `logOut()`, and `reset()`.
- Direct `updateAttribution()` can omit fields but cannot explicitly clear fields. Explicit clears are only guaranteed through helper methods like `setMediaSource(null)`.
- `getRemoteConfig(key)` distinguishes:
  - key missing
  - key present with `null` value
- `syncPurchases()` and `drainReceiptQueueAndRefreshCustomer()` are distinct APIs and must stay distinct in naming, docs, behavior, and example UX.
- Unknown native event names are ignored by Flutter's bridge. Known public events are the only surfaced ones today.
- Receipt event parsing must preserve unknown future receipt `type` values rather than crash or narrow them to a closed union only.
- Flutter's public UI mostly catches `AppActorError`, so React Native should normalize bridge/transport failures into the same public error model rather than leaking raw bridge exceptions.
- Flutter's bridge is event-heavy, not just request/response:
  - `customer_info_updated`
  - `receipt_pipeline_event`
  - `purchase_intent_received`
  - `deferred_purchase_resolved`
- Platform asymmetry is intentional:
  - some APIs throw on the wrong platform
  - some no-op
  - some return default sentinel values
- Backward-compat aliases and decode quirks are part of the contract:
  - `quietSyncPurchases()`
  - `setAppsflyerID()`
  - `setAppsFlyerID()`
  - deprecated `AppActorPackage.toJson()`
  - purchase status `"success"` -> `purchased`
  - package type alias parsing like `two_month`, `twoMonth`, `two_months`

### High-risk areas that must not be flattened

- `CustomerInfo` must preserve verification, offline/computed state, request metadata, management URL, token balance, consumable balances, product-entitlement mappings, promotional-offer fields, and lifecycle timestamps.
- `Offerings` and `Package` must preserve `lookupKey`, metadata, `storeProductId`, `basePlanId`, `offerId`, `offeringId`, `tokenAmount`, `position`, `serverId`, and upgrade-related purchase inputs.
- Cache/config getters rely on presence semantics, not plain truthiness.
- Client-side validation is a routing guard, not just UX polish.
- Privacy-safe profile context is auto-collected during `configure()`, while `collectDeviceIdentifiers()` is a separate opt-in path.

### Confirmed packaging/documentation risks from Flutter

- The Flutter iOS consumer install path is not self-contained today because the podspec depends on `AppActorPlugin 0.1.8`, but a plain CocoaPods consumer cannot resolve that pod from public specs alone on this machine.
- The React Native package must avoid repeating that ambiguity. If the iOS dependency is not available from the default CocoaPods sources, the README and example Podfile must document the exact extra source or Podfile pin required.
- Flutter's example currently mixes up the meaning of `syncPurchases()` versus explicit queue drain in log text. React Native docs and example must not repeat that confusion.
- Flutter example coverage is smoke-heavy relative to surface area. React Native needs stronger JS, native, and example verification.

## Authoritative Acceptance Rule

Every checklist item below must be either:

- implemented in the React Native package, or
- intentionally documented as unsupported because the native plugin does not support it on that platform, with behavior matching Flutter's public contract.

Nothing in Flutter's exported surface is allowed to silently disappear.

## Source Files That Define The Contract

### Flutter public barrel

- `lib/appactor_flutter.dart`

### Flutter API extensions

- `lib/src/extensions/appactor_lifecycle.dart`
- `lib/src/extensions/appactor_identity.dart`
- `lib/src/extensions/appactor_purchase.dart`
- `lib/src/extensions/appactor_data.dart`
- `lib/src/extensions/appactor_attributes.dart`
- `lib/src/extensions/appactor_config.dart`
- `lib/src/extensions/appactor_ios.dart`
- `lib/src/extensions/appactor_streams.dart`

### Flutter platform bridge and wire names

- `lib/src/appactor_platform.dart`
- `lib/src/internal/method_names.dart`

### Flutter public models

- `lib/src/models/appactor_error.dart`
- `lib/src/models/appactor_options.dart`
- `lib/src/models/attributes.dart`
- `lib/src/models/customer_info.dart`
- `lib/src/models/offerings.dart`
- `lib/src/models/verification_result.dart`
- `lib/src/models/purchase_result.dart`
- `lib/src/models/remote_config.dart`
- `lib/src/models/experiment.dart`
- `lib/src/models/receipt_event.dart`
- `lib/src/models/asa_diagnostics.dart`
- `lib/src/models/purchase_intent.dart`
- `lib/src/models/deferred_purchase_event.dart`
- `lib/src/models/storefront.dart`
- `lib/src/models/enums.dart`

### Flutter docs and tests that lock behavior

- `README.md`
- `doc/customer-attributes.md`
- `test/appactor_flutter_test.dart`
- `test/appactor_attributes_test.dart`
- `test/appactor_purchase_test.dart`
- `test/appactor_lifecycle_test.dart`

### Native bridge sources

- iOS:
  - `Sources/AppActorPlugin/AppActorPlugin.swift`
  - `Sources/AppActorPlugin/Infrastructure/PluginRequestRouter.swift`
  - `Sources/AppActorPlugin/Requests/*`
  - `Sources/AppActorPlugin/Events/*`
- Android:
  - `appactor-plugin/src/main/java/com/appactor/plugin/AppActorPlugin.kt`
  - `appactor-plugin/src/main/java/com/appactor/plugin/infrastructure/PluginRequestRouter.kt`
  - `appactor-plugin/src/main/java/com/appactor/plugin/requests/*`
  - `appactor-plugin/src/main/java/com/appactor/plugin/events/*`

## Public API Parity Checklist

### Lifecycle and configuration

- [ ] Export one singleton-style SDK entrypoint equivalent to `AppActor.instance`.
- [ ] Export `enableSearchAdsTracking({ options })`.
- [ ] Export `configure(apiKeyOrPlatformKeys, { appUserId, options })`.
- [ ] `configure` must support:
  - a single shared public API key string
  - a per-platform key object equivalent to Flutter `AppActorPlatformKeys`
  - optional `appUserId`
  - optional `logLevel`
  - automatic `platform_info` injection with flavor `react-native` and package version
- [ ] Export `reset()`.
- [ ] Export `sdkVersion()`.
- [ ] Export `setLogLevel(level)`.
- [ ] Export `enableInstallReferrer()` on Android and no-op on iOS.

### Identity

- [ ] Export `logIn(appUserId)`.
- [ ] Export `logOut()`.
- [ ] Export `getAppUserId()`.
- [ ] Export `getIsAnonymous()`.
- [ ] Preserve pre-configure identity semantics:
  - `getAppUserId()` -> `null`
  - `getIsAnonymous()` -> `true`
- [ ] Reset in-memory attribution helper merge state on identity transitions, matching Flutter behavior.

### Purchases

- [ ] Export `purchasePackage(package, options?)`.
- [ ] Support purchase options parity:
  - `offeringId`
  - `oldPurchaseToken`
  - `replacementMode`
  - `quantity`
  - `placement`
- [ ] Preserve placement normalization rules:
  - trim whitespace
  - omit blank placements
  - omit placements longer than 255 chars
- [ ] Reject quantity `< 1` before native dispatch.
- [ ] Export `restorePurchases({ syncWithAppStore })`.
- [ ] Preserve restore payload parity, including iOS `sync_with_app_store` serialization.
- [ ] Export `syncPurchases()`.
- [ ] Export deprecated alias `quietSyncPurchases()`.
- [ ] Export `drainReceiptQueueAndRefreshCustomer()`.
- [ ] Keep `syncPurchases()` documented and presented as quiet store sync.
- [ ] Keep `drainReceiptQueueAndRefreshCustomer()` documented and presented as the explicit queue-drain API.

### Data, cache, store, and diagnostics

- [ ] Export `setFallbackOfferings(rawBytes)`.
- [ ] Export `getCustomerInfo()`.
- [ ] Export `getOfferings()`.
- [ ] Export `activeEntitlementKeysOffline()`.
- [ ] Export `getCachedOfferings()`.
- [ ] Export `getCachedRemoteConfigs()`.
- [ ] Export `getCachedCustomerInfo()`.
- [ ] Export `canMakePurchases(requiredCapabilities?)`.
- [ ] Export `getStorefront()`.
- [ ] Export `getStoreCapabilities()`.

### Attributes and profile helpers

- [ ] Export `setAttributes(attributes)`.
- [ ] Export `setAttribute(key, value)`.
- [ ] Export `unsetAttribute(key)`.
- [ ] Export `setEmail(valueOrNull)`.
- [ ] Export `setDisplayName(valueOrNull)`.
- [ ] Export `setPhoneNumber(valueOrNull)`.
- [ ] Export `setPushToken(valueOrNull)`.
- [ ] Export `collectDeviceIdentifiers()`.
- [ ] Preserve Flutter-side custom-key validation:
  - non-empty
  - max length 64
  - allowed chars `[A-Za-z0-9_.:-]`
  - reject `$` prefix
  - reject `appactor.` prefix
  - reject `integration.` prefix
  - reject reserved automatic profile context aliases such as `appVersion`, `platform`, `userCountry`
- [ ] Preserve supported custom value shapes:
  - string
  - finite number
  - boolean
  - string arrays
  - number arrays
  - boolean arrays
  - date envelope `{ value, valueType: "date" }`
- [ ] Reject `null` custom values; deletion must stay explicit via `unsetAttribute`.
- [ ] Preserve email and phone validation behavior before native dispatch.

### Integration identifiers and attribution

- [ ] Export `setIntegrationIdentifier(type, value)`.
- [ ] Export `unsetIntegrationIdentifier(type)`.
- [ ] Export `setCustomIntegrationIdentifier(type, value)`.
- [ ] Export `unsetCustomIntegrationIdentifier(type)`.
- [ ] Export helper aliases:
  - `setAppsflyerID`
  - `setAppsFlyerID`
  - `setAdjustID`
  - `setBranchID`
  - `setFirebaseAppInstanceID`
  - `setOneSignalID`
- [ ] Export `updateAttribution(attribution)`.
- [ ] Preserve Flutter's direct-attribution contract:
  - omitting a field means "do not send that field"
  - direct `updateAttribution()` is not the same thing as explicit clear
- [ ] Export helper merge calls:
  - `setMediaSource`
  - `setCampaign`
  - `setAdGroup`
  - `setAd`
  - `setKeyword`
  - `setCreative`
- [ ] Preserve explicit `null` helper clears on those six convenience methods.
- [ ] Keep direct `updateAttribution` independent from convenience-helper merge state.
- [ ] Preserve validation for:
  - integration identifier types and values
  - attribution provider override
  - canonical attribution strings
  - metadata keys
  - backend-incompatible nested or mixed values

### Remote config and experiments

- [ ] Export `getRemoteConfigs()`.
- [ ] Export `getExperimentAssignment(key)`.
- [ ] Export `getRemoteConfig(key)`.
- [ ] Export convenience getters:
  - `getRemoteConfigBool`
  - `getRemoteConfigString`
  - `getRemoteConfigNumber`
  - `getRemoteConfigInt`

### iOS-only APIs

- [ ] Export `presentOfferCodeRedeemSheet()`.
- [ ] Export `getAsaDiagnostics()`.
- [ ] Export `getPendingAsaPurchaseEventCount()`.
- [ ] Export `getAsaFirstInstallOnDevice()`.
- [ ] Export `getAsaFirstInstallOnAccount()`.
- [ ] Export `purchaseFromIntent(intent)`.
- [ ] On non-iOS platforms, reject with explicit unsupported behavior matching Flutter's public contract.

### Event surface

- [ ] Export `onCustomerInfoUpdated`.
- [ ] Export `onReceiptPipelineEvent`.
- [ ] Export `onPurchaseIntent`.
- [ ] Export `onDeferredPurchaseResolved`.
- [ ] Native event transport must keep the same event names:
  - `customer_info_updated`
  - `receipt_pipeline_event`
  - `purchase_intent_received`
  - `deferred_purchase_resolved`
- [ ] Debug log events named `sdk_log` should be safely ignored or optionally surfaced only in dev tooling, without breaking app flow.
- [ ] Unknown native event names should not crash the JS bridge.

## Native Bridge Checklist

### Shared transport model

- [ ] Implement one native `execute(method, json)` command path on iOS.
- [ ] Implement one native `execute(method, json)` command path on Android.
- [ ] Keep JSON envelope semantics compatible with Flutter:
  - success payload under `success`
  - error payload under `error`
  - primitive success values rewrapped into `{ value: ... }` on JS side
- [ ] Decode native errors into one `AppActorError` model with code/message/detail/requestId/scope/retryAfterSeconds.
- [ ] Normalize bridge-level failures into the same `AppActorError` public surface instead of leaking raw transport exceptions.
- [ ] Keep the bridge single-path architecture:
  - JS -> native via `execute(method, json)`
  - native -> JS via one event emitter path

### iOS bridge

- [ ] Build a React Native iOS module in Swift that depends on pod `AppActorPlugin` `0.1.8`.
- [ ] Make the iOS install story reproducible for clean consumer apps.
- [ ] Decide and document iOS privacy metadata ownership for the RN package.
- [ ] Forward RN method calls into `AppActorPlugin.shared.execute(method:withJsonString:completion:)`.
- [ ] Subscribe to `AppActorPlugin.shared.delegate`.
- [ ] Start event listening on module initialization / observation start.
- [ ] Stop event listening safely when no longer needed.

### Android bridge

- [ ] Build a React Native Android module in Kotlin that depends on Maven artifact `com.appactor:appactor-plugin:2.3.7`.
- [ ] Call `AppActorPlugin.setContext(context)` during module/package setup.
- [ ] Keep `Activity` synced through lifecycle so purchase APIs can access it.
- [ ] Forward RN method calls into `AppActorPlugin.execute(method, json, callback)`.
- [ ] Subscribe to `AppActorPlugin.eventListener`.
- [ ] Start event listening on initialization.
- [ ] Stop event listening safely during teardown if needed.

### Method availability matrix

- [ ] Support the full shared method set on both platforms:
  - `configure`
  - `reset`
  - `get_sdk_version`
  - `log_in`
  - `log_out`
  - `purchase_package`
  - `restore_purchases`
  - `sync_purchases`
  - `quiet_sync_purchases`
  - `drain_receipt_queue_and_refresh_customer`
  - `get_customer_info`
  - `get_offerings`
  - `active_entitlement_keys_offline`
  - `get_remote_configs`
  - `get_experiment_assignment`
  - `set_log_level`
  - `get_app_user_id`
  - `get_is_anonymous`
  - `get_cached_offerings`
  - `get_cached_remote_configs`
  - `get_cached_customer_info`
  - `get_remote_config`
  - `set_fallback_offerings`
  - `set_attributes`
  - `set_attribute`
  - `unset_attribute`
  - `set_email`
  - `set_display_name`
  - `set_phone_number`
  - `set_push_token`
  - `collect_device_identifiers`
  - `set_integration_identifier`
  - `update_attribution`
  - `set_media_source`
  - `set_campaign`
  - `set_ad_group`
  - `set_ad`
  - `set_keyword`
  - `set_creative`
- [ ] iOS-only wire methods:
  - `enable_apple_search_ads_tracking`
  - `present_offer_code_redeem_sheet`
  - `get_asa_diagnostics`
  - `get_pending_asa_purchase_event_count`
  - `get_asa_first_install_on_device`
  - `get_asa_first_install_on_account`
  - `purchase_from_intent`
- [ ] Android-only wire methods:
  - `enable_install_referrer`
  - `can_make_purchases`
  - `get_storefront`
  - `get_store_capabilities`

## Public Model Parity Checklist

### Core configuration and utility models

- [ ] `AppActorOptions`
- [ ] `AppActorPlatformKeys`
- [ ] `AppActorAsaOptions`
- [ ] `AppActorError`
- [ ] `AppActorVerificationResult`

### Offerings and catalog models

- [ ] `AppActorOfferings`
- [ ] `AppActorOffering`
- [ ] `AppActorPackage`
- [ ] Preserve full package/store lookup and upgrade-related fields, not just price/product basics.

### Customer state models

- [ ] `AppActorCustomerInfo`
- [ ] `AppActorEntitlementInfo`
- [ ] `AppActorSubscriptionInfo`
- [ ] `AppActorNonSubscription`
- [ ] `AppActorTokenBalance`
- [ ] Preserve full customer-state metadata, not just entitlement booleans.

### Purchase and store models

- [ ] `AppActorPurchaseResult`
- [ ] `AppActorPurchaseInfo`
- [ ] `AppActorStorefront`

### Config and experiment models

- [ ] `AppActorRemoteConfigs`
- [ ] `AppActorRemoteConfigItem`
- [ ] `AppActorExperimentAssignment`

### Attribution and helper models

- [ ] `AppActorAttributeValue`
- [ ] `AppActorAttribution`

### Event payload models

- [ ] `AppActorReceiptPipelineEvent`
- [ ] `AppActorPurchaseIntent`
- [ ] `AppActorDeferredPurchaseEvent`
- [ ] `AppActorAsaDiagnostics`

### Enum parity

- [ ] `AppActorLogLevel`
- [ ] `AppActorStore`
- [ ] `AppActorPackageType`
- [ ] `AppActorProductType`
- [ ] `AppActorOwnershipType`
- [ ] `AppActorPeriodType`
- [ ] `AppActorSubscriptionStatus`
- [ ] `AppActorCancellationReason`
- [ ] `AppActorConfigValueType`
- [ ] `AppActorStoreCapability`
- [ ] `AppActorSubscriptionReplacementMode`
- [ ] `AppActorIntegrationIdentifier`
- [ ] `AppActorAttributionProvider`
- [ ] `AppActorAttributionStatus`
- [ ] `AppActorPurchaseStatus`

## Example App Checklist

- [ ] Create a bare React Native example app using current React Native `0.85.3`.
- [ ] Example must cover:
  - configure
  - sdkVersion
  - getCustomerInfo
  - getOfferings
  - restorePurchases
  - syncPurchases
  - quietSyncPurchases
  - purchasePackage
  - logIn
  - logOut
  - remote config fetch
  - experiment fetch
  - offline entitlement keys
  - receipt pipeline event log
  - customer info event log
  - iOS ASA diagnostics and offer code actions where relevant
- [ ] Example should visibly render important package/customer fields that Flutter example uses.
- [ ] Example README must include exact setup for:
  - public API key injection
  - iOS native dependency resolution, if extra Podfile sources or pins are required
  - Android prerequisites
- [ ] Example should explicitly demonstrate throw vs no-op vs default-return platform behavior where relevant.

## Testing Checklist

### JS / TypeScript unit coverage

- [ ] Method-to-wire-name coverage for every exported API.
- [ ] Payload serialization tests for configure, purchases, attributes, attribution, and remote config helpers.
- [ ] Validation tests for reserved keys, invalid values, invalid quantity, invalid platform key usage, and null-clearing semantics.
- [ ] Restore-purchases serialization coverage, especially `syncWithAppStore`.
- [ ] Event decoding tests for all four event streams.
- [ ] Event dispatch tests for malformed event payloads and unknown event names.
- [ ] Bridge-error normalization tests for null response, invalid JSON, native structured error, and raw transport failure cases.
- [ ] Model parsing/equality/helper tests for offerings, customer info, purchase result, error helpers, verification result, remote configs, experiment assignment, ASA diagnostics, storefront, and deferred purchase event.
- [ ] Backward-compat alias tests for deprecated/legacy wrapper behavior.

### Native smoke coverage

- [ ] iOS module compiles with pod `AppActorPlugin`.
- [ ] iOS install path is verified from a clean example app with the documented pod setup.
- [ ] Android module compiles with Maven artifact `com.appactor:appactor-plugin`.
- [ ] Example iOS app boots and links the pod.
- [ ] Example Android app boots and links the Maven artifact.

## Packaging And Release Checklist

- [ ] Package metadata points to `appactor/appactor-react-native`.
- [ ] README explains install, quick start, attributes, sync, platform notes, and unsupported behavior.
- [ ] Changelog initialized.
- [ ] License and security docs present.
- [ ] Type declarations and JS bundle outputs are generated correctly.
- [ ] iOS podspec exists and pins `AppActorPlugin` `0.1.8`.
- [ ] Android Gradle config exists and pins `com.appactor:appactor-plugin:2.3.7`.
- [ ] Wrapper version is aligned across package metadata, any exported wrapper version constant, podspec, Android library version, README, CHANGELOG, and example surfaces.
- [ ] Publish-ready ignore files and npm package files are correct.

## Final Review Checklist

Before final handoff, run a second 6-subagent review against:

- Flutter public API and docs
- native iOS/Android bridge parity
- package/export surface
- JS validation semantics
- example app coverage
- tests and packaging

Only close the job after all validated review findings are fixed and the final diff still satisfies this document.
