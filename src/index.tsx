import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { fromByteArray } from 'base64-js';

export const appActorReactNativeVersion = '0.1.0';

type JsonObject = Record<string, unknown>;
type JsonMap<T> = Record<string, T>;
export type AppActorKeyValueInput<T = unknown> =
  | Record<string, T>
  | Iterable<readonly [string, T]>;
type NativeEventEnvelope = {
  name?: string;
  json?: string;
};

export type AppActorEventSubscription = {
  remove: () => void;
};

const METHOD_NAMES = {
  configure: 'configure',
  reset: 'reset',
  getSdkVersion: 'get_sdk_version',
  logIn: 'log_in',
  logOut: 'log_out',
  purchasePackage: 'purchase_package',
  restorePurchases: 'restore_purchases',
  syncPurchases: 'sync_purchases',
  quietSyncPurchases: 'quiet_sync_purchases',
  drainReceiptQueueAndRefreshCustomer:
    'drain_receipt_queue_and_refresh_customer',
  getCustomerInfo: 'get_customer_info',
  getOfferings: 'get_offerings',
  activeEntitlementKeysOffline: 'active_entitlement_keys_offline',
  getRemoteConfigs: 'get_remote_configs',
  getExperimentAssignment: 'get_experiment_assignment',
  setLogLevel: 'set_log_level',
  enableAppleSearchAdsTracking: 'enable_apple_search_ads_tracking',
  presentOfferCodeRedeemSheet: 'present_offer_code_redeem_sheet',
  getAsaDiagnostics: 'get_asa_diagnostics',
  getPendingAsaPurchaseEventCount: 'get_pending_asa_purchase_event_count',
  getAsaFirstInstallOnDevice: 'get_asa_first_install_on_device',
  getAsaFirstInstallOnAccount: 'get_asa_first_install_on_account',
  getAppUserId: 'get_app_user_id',
  getIsAnonymous: 'get_is_anonymous',
  getCachedOfferings: 'get_cached_offerings',
  getCachedRemoteConfigs: 'get_cached_remote_configs',
  getCachedCustomerInfo: 'get_cached_customer_info',
  getRemoteConfig: 'get_remote_config',
  purchaseFromIntent: 'purchase_from_intent',
  enableInstallReferrer: 'enable_install_referrer',
  setFallbackOfferings: 'set_fallback_offerings',
  canMakePurchases: 'can_make_purchases',
  getStorefront: 'get_storefront',
  getStoreCapabilities: 'get_store_capabilities',
  setAttributes: 'set_attributes',
  setAttribute: 'set_attribute',
  unsetAttribute: 'unset_attribute',
  setEmail: 'set_email',
  setDisplayName: 'set_display_name',
  setPhoneNumber: 'set_phone_number',
  setPushToken: 'set_push_token',
  collectDeviceIdentifiers: 'collect_device_identifiers',
  setIntegrationIdentifier: 'set_integration_identifier',
  updateAttribution: 'update_attribution',
  setMediaSource: 'set_media_source',
  setCampaign: 'set_campaign',
  setAdGroup: 'set_ad_group',
  setAd: 'set_ad',
  setKeyword: 'set_keyword',
  setCreative: 'set_creative',
} as const;

const NATIVE_EVENT_NAME = 'appactor_event';
const PLUGIN_ERROR_NULL_RESPONSE = 1001;
const PLUGIN_ERROR_INVALID_JSON = 1002;
const PLUGIN_ERROR_NATIVE_BRIDGE = 1004;
const APP_ACTOR_SINGLETON_GUARD = Symbol('AppActor.singleton');
const LEGACY_PROFILE_CURRENT_ALIASES = new Set([
  'appVersion',
  'appBuild',
  'sdkVersion',
  'platform',
  'platformFlavor',
  'platformVersion',
  'osVersion',
  'deviceModel',
  'bundleId',
  'locale',
  'timezone',
  'storefrontCountry',
  'ipCountry',
  'localeCountry',
  'attConsentStatus',
  'deviceLocale',
  'userCountry',
  'userCountrySource',
]);

type NativeModuleShape = {
  execute(method: string, payload: string): Promise<string | null>;
};

const nativeModule: NativeModuleShape | undefined =
  NativeModules.AppactorReactNative;
const nativeEmitter = nativeModule
  ? new NativeEventEmitter(nativeModule as never)
  : null;
let debugSdkLogSubscription: { remove(): void } | null = null;

function isRecord(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeForEquality(
  value: unknown,
  seen: WeakSet<object> = new WeakSet()
): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof Set) {
    return Array.from(value)
      .map((item) => normalizeForEquality(item, seen))
      .sort((left, right) =>
        (JSON.stringify(left) ?? '').localeCompare(
          JSON.stringify(right) ?? ''
        )
      );
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeForEquality(item, seen));
  }
  if (isRecord(value)) {
    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);
    const normalized = Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => typeof item !== 'function')
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalizeForEquality(item, seen)])
    );
    seen.delete(value);
    return normalized;
  }
  return value;
}

export function appActorModelEquals(left: unknown, right: unknown): boolean {
  return (
    JSON.stringify(normalizeForEquality(left)) ===
    JSON.stringify(normalizeForEquality(right))
  );
}

function byteLength(value: string): number {
  return unescape(encodeURIComponent(value)).length;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asInteger(value: unknown): number | undefined {
  const numberValue = asNumber(value);
  return numberValue == null ? undefined : Math.trunc(numberValue);
}

function ensureRecord(value: unknown): JsonObject {
  return isRecord(value) ? value : {};
}

function requireRecord(value: unknown, fieldName: string): JsonObject {
  if (!isRecord(value)) {
    throw new Error(`${fieldName} must be an object.`);
  }
  return value;
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string.`);
  }
  return value;
}

function requireInteger(value: unknown, fieldName: string): number {
  const integerValue = asInteger(value);
  if (integerValue == null) {
    throw new Error(`${fieldName} must be a number.`);
  }
  return integerValue;
}

function optionalInteger(value: unknown, fieldName: string): number | undefined {
  return value == null ? undefined : requireInteger(value, fieldName);
}

function requireNumber(value: unknown, fieldName: string): number {
  const numberValue = asNumber(value);
  if (numberValue == null) {
    throw new Error(`${fieldName} must be a number.`);
  }
  return numberValue;
}

function optionalNumber(value: unknown, fieldName: string): number | undefined {
  return value == null ? undefined : requireNumber(value, fieldName);
}

function optionalStringArray(value: unknown, fieldName: string): string[] {
  if (value == null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array.`);
  }
  return value.map((item, index) =>
    requireString(item, `${fieldName}[${index}]`)
  );
}

function mapStringRecord(
  value: unknown,
  fieldName: string
): Record<string, string> | undefined {
  if (value == null) {
    return undefined;
  }
  const record = requireRecord(value, fieldName);
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [
      key,
      requireString(item, `${fieldName}.${key}`),
    ] as const)
  );
}

function isIterable(value: unknown): value is Iterable<unknown> {
  return (
    value != null &&
    typeof (value as { [Symbol.iterator]?: unknown })[Symbol.iterator] ===
      'function'
  );
}

function ensureNativeModule(): NativeModuleShape {
  if (!nativeModule) {
    throw new AppActorError({
      code: PLUGIN_ERROR_NATIVE_BRIDGE,
      message: 'AppActor native module is not linked.',
      detail:
        'Make sure the iOS pod and Android package are installed and the app was rebuilt.',
    });
  }
  return nativeModule;
}

function parseNativeEnvelope(payload: string | null): JsonObject {
  if (payload == null) {
    throw new AppActorError({
      code: PLUGIN_ERROR_NULL_RESPONSE,
      message: 'Null response from native',
    });
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(payload);
  } catch (error) {
    throw new AppActorError({
      code: PLUGIN_ERROR_INVALID_JSON,
      message: 'Invalid JSON from native',
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  if (!isRecord(decoded)) {
    throw new AppActorError({
      code: PLUGIN_ERROR_INVALID_JSON,
      message: 'Invalid JSON envelope from native',
    });
  }

  if (isRecord(decoded.error)) {
    throw AppActorError.fromJson(decoded.error);
  }

  const success = decoded.success;
  if (isRecord(success)) {
    return success;
  }

  return { value: success };
}

function normalizeBridgeFailure(error: unknown): AppActorError {
  if (error instanceof AppActorError) {
    return error;
  }

  const raw = ensureRecord(error);
  const message =
    asString(raw.message) ??
    (error instanceof Error ? error.message : 'Native bridge call failed');
  const detailParts = [
    asString(raw.code),
    asString(raw.userInfo ? ensureRecord(raw.userInfo).NSLocalizedFailureReason : undefined),
    error instanceof Error ? error.name : undefined,
  ].filter(Boolean);

  return new AppActorError({
    code: PLUGIN_ERROR_NATIVE_BRIDGE,
    message,
    detail: detailParts.join(', '),
  });
}

async function execute(
  method: string,
  params?: JsonObject
): Promise<JsonObject> {
  const module = ensureNativeModule();
  const payload = params ? JSON.stringify(params) : '{}';

  try {
    const result = await module.execute(method, payload);
    return parseNativeEnvelope(result);
  } catch (error) {
    throw normalizeBridgeFailure(error);
  }
}

function normalizePlacement(placement?: string | null): string | undefined {
  if (placement == null) {
    return undefined;
  }

  const normalized = placement.trim();
  if (normalized.length === 0 || normalized.length > 255) {
    return undefined;
  }

  return normalized;
}

function validateCustomKey(key: string): void {
  if (!key) {
    throw new Error('Attribute key cannot be empty.');
  }
  if (key.length > 64) {
    throw new Error('Attribute keys can contain at most 64 characters.');
  }
  if (!/^[A-Za-z0-9_.:-]+$/.test(key)) {
    throw new Error(
      'Attribute keys may only contain letters, numbers, underscore, dot, colon, or dash.'
    );
  }
  if (key.startsWith('$')) {
    throw new Error('Custom attribute keys cannot start with "$".');
  }
  if (key.toLowerCase().startsWith('appactor.')) {
    throw new Error('Custom attribute keys cannot start with "appactor.".');
  }
  if (key.toLowerCase().startsWith('integration.')) {
    throw new Error(
      'Integration identifiers must use setIntegrationIdentifier().'
    );
  }
  if (LEGACY_PROFILE_CURRENT_ALIASES.has(key)) {
    throw new Error(
      'Profile context fields are reserved for AppActor automatic profile context.'
    );
  }
}

function validateEmail(email: string): void {
  if (!email || email.trim() !== email) {
    throw new Error('Email must not be empty or padded with whitespace.');
  }
  if (
    byteLength(email) > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new Error('Email must be valid.');
  }
}

function validatePhoneNumber(phoneNumber: string): void {
  if (!phoneNumber || phoneNumber.trim() !== phoneNumber) {
    throw new Error(
      'Phone number must not be empty or padded with whitespace.'
    );
  }
  const digitCount = (phoneNumber.match(/\d/g) ?? []).length;
  if (
    byteLength(phoneNumber) > 64 ||
    digitCount < 3 ||
    !/^[+0-9().\-\s]+$/.test(phoneNumber)
  ) {
    throw new Error('Phone number must be valid.');
  }
}

function validateIntegrationIdentifierType(type: string): void {
  if (!type || type.trim() !== type) {
    throw new Error(
      'Integration identifier type must not be empty or padded with whitespace.'
    );
  }
  if (type.length > 64) {
    throw new Error(
      'Integration identifier type can contain at most 64 characters.'
    );
  }
  if (!/^[A-Za-z0-9_.:-]+$/.test(type)) {
    throw new Error(
      'Integration identifier type may only contain letters, numbers, underscore, dot, colon, or dash.'
    );
  }
  if (type.startsWith('$')) {
    throw new Error('Integration identifier type cannot start with "$".');
  }
  if (type.toLowerCase().startsWith('appactor.')) {
    throw new Error(
      'Integration identifier type cannot start with "appactor.".'
    );
  }
}

function validateIntegrationIdentifierValue(value: string): void {
  if (!value || value.trim() !== value) {
    throw new Error(
      'Integration identifier value must not be empty or padded with whitespace.'
    );
  }
  if (byteLength(value) > 1024) {
    throw new Error('Integration identifier value must be at most 1024 bytes.');
  }
}

function validateAttributionProvider(provider?: string | null): void {
  if (provider == null) {
    return;
  }
  if (!provider || provider.trim() !== provider) {
    throw new Error(
      'Attribution provider must not be empty or padded with whitespace.'
    );
  }
  if (byteLength(provider) > 64) {
    throw new Error('Attribution provider must be at most 64 bytes.');
  }
}

function validateAttributionString(
  field: string,
  value?: string | null
): void {
  if (value == null) {
    return;
  }
  if (!value || value.trim() !== value) {
    throw new Error(
      `Attribution field "${field}" must not be empty or padded with whitespace.`
    );
  }
  if (byteLength(value) > 1024) {
    throw new Error(
      `Attribution field "${field}" must be at most 1024 bytes.`
    );
  }
}

function validateMetadataKey(key: string): string {
  validateCustomKey(key);
  return key;
}

function entriesFromInput<T>(
  input: AppActorKeyValueInput<T>,
  name: string
): Array<readonly [string, T]> {
  if (isIterable(input)) {
    const normalized: Array<readonly [string, T]> = [];
    let index = 0;
    for (const entry of input) {
      if (!Array.isArray(entry) || entry.length !== 2) {
        throw new Error(
          `${name}[${index}] must be a [key, value] entry tuple.`
        );
      }
      const [key, value] = entry;
      if (typeof key !== 'string') {
        throw new Error(`${name}[${index}] key must be a string.`);
      }
      normalized.push([key, value as T]);
      index += 1;
    }

    return normalized;
  }

  if (isRecord(input)) {
    return Object.entries(input);
  }

  throw new Error(
    `${name} must be an object or iterable of [key, value] entries.`
  );
}

function normalizeAttributeValue(
  value: unknown,
  name = 'value'
): unknown {
  if (value instanceof AppActorAttributeValue) {
    return value.toJson();
  }
  if (value == null) {
    throw new Error(`${name} cannot be null.`);
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`${name} numbers must be finite.`);
    }
    return value;
  }
  if (value instanceof Date) {
    return { value: value.toISOString(), valueType: 'date' };
  }
  const listValue = Array.isArray(value)
    ? value
    : isIterable(value)
      ? Array.from(value)
      : null;
  if (listValue) {
    if (listValue.length > 20) {
      throw new Error(`${name} lists can contain at most 20 items.`);
    }
    if (listValue.every((item) => typeof item === 'string')) {
      return listValue;
    }
    if (
      listValue.every(
        (item) => typeof item === 'number' && Number.isFinite(item)
      )
    ) {
      return listValue;
    }
    if (listValue.every((item) => typeof item === 'boolean')) {
      return listValue;
    }
    throw new Error(
      `${name} lists must contain only strings, finite numbers, or booleans.`
    );
  }
  throw new Error(
    `${name} must be a string, number, boolean, Date, AppActorAttributeValue, or a flat primitive list.`
  );
}

function normalizeAttributes(
  attributes: AppActorKeyValueInput
): JsonObject {
  return Object.fromEntries(
    entriesFromInput(attributes, 'attributes').map(([key, value]) => {
      validateCustomKey(key);
      return [key, normalizeAttributeValue(value, `attributes[${key}]`)];
    })
  );
}

function normalizeMetadata(metadata: AppActorKeyValueInput): JsonObject {
  return Object.fromEntries(
    entriesFromInput(metadata, 'metadata').map(([key, value]) => [
      validateMetadataKey(key),
      normalizeAttributeValue(value, `metadata[${key}]`),
    ])
  );
}

function resolveApiKey(
  apiKey: string | AppActorPlatformKeys
): string {
  if (typeof apiKey === 'string') {
    return apiKey;
  }

  if (!(apiKey instanceof AppActorPlatformKeys)) {
    throw new Error('Expected a string or AppActorPlatformKeys.');
  }

  if (Platform.OS === 'ios') {
    return apiKey.ios;
  }
  if (Platform.OS === 'android') {
    return apiKey.android;
  }

  throw new UnsupportedError(
    'AppActorPlatformKeys is only supported on iOS and Android.'
  );
}

function decodeEventPayload(payload?: string | null): JsonObject | null {
  if (!payload) {
    return null;
  }
  try {
    const parsed = JSON.parse(payload);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isDevelopmentRuntime(): boolean {
  return typeof __DEV__ === 'boolean' ? __DEV__ : false;
}

function maybeLogSdkEventInDebug(event: NativeEventEnvelope): void {
  if (!isDevelopmentRuntime() || event.name !== 'sdk_log') {
    return;
  }
  const payload = decodeEventPayload(event.json);
  if (!payload) {
    return;
  }
  const level = (asString(payload.level) ?? 'info').toUpperCase();
  const category = asString(payload.category) ?? '';
  const message = asString(payload.message) ?? '';
  const logger =
    typeof console.debug === 'function' ? console.debug : console.log;
  logger(`[AppActor/${level}] ${category}: ${message}`);
}

function ensureDebugSdkLogSubscription(): void {
  if (!nativeEmitter || debugSdkLogSubscription != null || !isDevelopmentRuntime()) {
    return;
  }
  debugSdkLogSubscription = nativeEmitter.addListener(
    NATIVE_EVENT_NAME,
    maybeLogSdkEventInDebug
  );
}

function resetDebugSdkLogSubscription(): void {
  debugSdkLogSubscription?.remove();
  debugSdkLogSubscription = null;
}

function mapValues<T>(
  value: unknown,
  mapper: (entry: JsonObject) => T
): JsonMap<T> {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      mapper(requireRecord(item, key)),
    ] as const)
  );
}

function mapListValues<T>(
  value: unknown,
  mapper: (entry: JsonObject) => T
): JsonMap<T[]> {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (!Array.isArray(item)) {
        throw new Error(`${key} must be an array.`);
      }
      return [
        key,
        item.map((entry, index) =>
          mapper(requireRecord(entry, `${key}[${index}]`))
        ),
      ] as const;
    })
  );
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item, index) => requireString(item, `[${index}]`));
}

function mapStringLists(value: unknown): JsonMap<string[]> {
  if (value == null) {
    return {};
  }
  const record = requireRecord(value, 'value');
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => {
      if (!Array.isArray(item)) {
        throw new Error(`${key} must be an array.`);
      }
      return [
        key,
        item.map((entry, index) => requireString(entry, `${key}[${index}]`)),
      ] as const;
    })
  );
}

export enum AppActorLogLevel {
  Debug = 'debug',
  Verbose = 'verbose',
  Info = 'info',
  Warn = 'warn',
  Error = 'error',
}

export enum AppActorStore {
  PlayStore = 'play_store',
  AppStore = 'app_store',
  Stripe = 'stripe',
  Promotional = 'promotional',
  Unknown = 'unknown',
}

export enum AppActorPackageType {
  Weekly = 'weekly',
  Monthly = 'monthly',
  TwoMonth = 'two_month',
  ThreeMonth = 'three_month',
  SixMonth = 'six_month',
  Annual = 'annual',
  Lifetime = 'lifetime',
  Consumable = 'consumable',
  Custom = 'custom',
}

export enum AppActorProductType {
  Subscription = 'subscription',
  NonConsumable = 'non_consumable',
  Consumable = 'consumable',
  Unknown = 'unknown',
}

export enum AppActorOwnershipType {
  Purchased = 'purchased',
  FamilyShared = 'family_shared',
  Unknown = 'unknown',
}

export enum AppActorPeriodType {
  Weekly = 'weekly',
  Monthly = 'monthly',
  TwoMonth = 'two_month',
  ThreeMonth = 'three_month',
  SixMonth = 'six_month',
  Annual = 'annual',
  Lifetime = 'lifetime',
  Normal = 'normal',
  Trial = 'trial',
  Intro = 'intro',
  Unknown = 'unknown',
}

export enum AppActorSubscriptionStatus {
  Active = 'active',
  GracePeriod = 'grace_period',
  BillingRetry = 'billing_retry',
  Expired = 'expired',
  Revoked = 'revoked',
  Upgraded = 'upgraded',
  Unknown = 'unknown',
}

export enum AppActorCancellationReason {
  CustomerCancelled = 'customer_cancelled',
  DeveloperCancelled = 'developer_cancelled',
  Unknown = 'unknown',
}

export enum AppActorConfigValueType {
  Boolean = 'boolean',
  Number = 'number',
  String = 'string',
  Json = 'json',
  Unknown = 'unknown',
}

export enum AppActorStoreCapability {
  Purchases = 'purchases',
  Subscriptions = 'subscriptions',
  InAppProducts = 'in_app_products',
  PurchaseHistory = 'purchase_history',
  Storefront = 'storefront',
}

export enum AppActorSubscriptionReplacementMode {
  WithTimeProration = 'with_time_proration',
  ChargeProrated = 'charge_prorated',
  WithoutProration = 'without_proration',
  ChargeFullPrice = 'charge_full_price',
  Deferred = 'deferred',
}

export enum AppActorIntegrationIdentifier {
  AppsFlyerId = 'appsflyer_id',
  AdjustId = 'adjust_adid',
  BranchId = 'branch_id',
  FirebaseAppInstanceId = 'firebase_app_instance_id',
  AmplitudeUserId = 'amplitude_user_id',
  AmplitudeDeviceId = 'amplitude_device_id',
  MixpanelDistinctId = 'mixpanel_distinct_id',
  FacebookAnonymousId = 'fb_anon_id',
  OneSignalPlayerId = 'onesignal_id',
}

export enum AppActorAttributionProvider {
  AppleSearchAds = 'apple_search_ads',
  GoogleAds = 'google_ads',
  Meta = 'meta',
  TikTok = 'tiktok',
  Snap = 'snap',
  AppsFlyer = 'appsflyer',
  Adjust = 'adjust',
  Branch = 'branch',
  Firebase = 'firebase',
  Custom = 'custom',
}

export enum AppActorAttributionStatus {
  NonOrganic = 'non_organic',
  Organic = 'organic',
  Unattributed = 'unattributed',
  Unresolved = 'unresolved',
  Error = 'error',
  Unknown = 'unknown',
}

export enum AppActorPurchaseStatus {
  Purchased = 'purchased',
  Cancelled = 'cancelled',
  Pending = 'pending',
  Restored = 'restored',
  Unknown = 'unknown',
}

export enum AppActorVerificationResult {
  NotRequested = 'notRequested',
  Verified = 'verified',
  VerifiedOnDevice = 'verifiedOnDevice',
  Failed = 'failed',
}

function fromEnumValue<T extends string>(
  allowed: readonly T[],
  value: unknown,
  fallback: T,
  aliases: Record<string, T> = {}
): T {
  if (typeof value !== 'string') {
    return fallback;
  }
  if (allowed.includes(value as T)) {
    return value as T;
  }
  return aliases[value] ?? fallback;
}

function parseStore(value: unknown): AppActorStore {
  return fromEnumValue(
    Object.values(AppActorStore),
    value,
    AppActorStore.Unknown,
    {
      playStore: AppActorStore.PlayStore,
      appStore: AppActorStore.AppStore,
    }
  );
}

function parsePackageType(value: unknown): AppActorPackageType {
  return fromEnumValue(
    Object.values(AppActorPackageType),
    value,
    AppActorPackageType.Custom,
    {
      two_months: AppActorPackageType.TwoMonth,
      twoMonth: AppActorPackageType.TwoMonth,
      three_months: AppActorPackageType.ThreeMonth,
      threeMonth: AppActorPackageType.ThreeMonth,
      six_months: AppActorPackageType.SixMonth,
      sixMonth: AppActorPackageType.SixMonth,
    }
  );
}

function parseProductType(value: unknown): AppActorProductType {
  return fromEnumValue(
    Object.values(AppActorProductType),
    value,
    AppActorProductType.Unknown,
    {
      nonConsumable: AppActorProductType.NonConsumable,
    }
  );
}

function parseOwnershipType(value: unknown): AppActorOwnershipType {
  return fromEnumValue(
    Object.values(AppActorOwnershipType),
    value,
    AppActorOwnershipType.Unknown,
    {
      familyShared: AppActorOwnershipType.FamilyShared,
    }
  );
}

function parsePeriodType(value: unknown): AppActorPeriodType {
  return fromEnumValue(
    Object.values(AppActorPeriodType),
    value,
    AppActorPeriodType.Unknown,
    {
      twoMonth: AppActorPeriodType.TwoMonth,
      threeMonth: AppActorPeriodType.ThreeMonth,
      sixMonth: AppActorPeriodType.SixMonth,
    }
  );
}

function parseSubscriptionStatus(value: unknown): AppActorSubscriptionStatus {
  return fromEnumValue(
    Object.values(AppActorSubscriptionStatus),
    value,
    AppActorSubscriptionStatus.Unknown,
    {
      gracePeriod: AppActorSubscriptionStatus.GracePeriod,
      billingRetry: AppActorSubscriptionStatus.BillingRetry,
    }
  );
}

function parseCancellationReason(value: unknown): AppActorCancellationReason {
  return fromEnumValue(
    Object.values(AppActorCancellationReason),
    value,
    AppActorCancellationReason.Unknown,
    {
      customerCancelled: AppActorCancellationReason.CustomerCancelled,
      developerCancelled: AppActorCancellationReason.DeveloperCancelled,
    }
  );
}

function parseConfigValueType(value: unknown): AppActorConfigValueType {
  return fromEnumValue(
    Object.values(AppActorConfigValueType),
    value,
    AppActorConfigValueType.Unknown
  );
}

function parseStoreCapability(value: unknown): AppActorStoreCapability | null {
  const parsed = fromEnumValue(
    Object.values(AppActorStoreCapability),
    value,
    '' as AppActorStoreCapability,
    {
      inAppProducts: AppActorStoreCapability.InAppProducts,
      purchaseHistory: AppActorStoreCapability.PurchaseHistory,
    }
  );
  return parsed || null;
}

function parsePurchaseStatus(value: unknown): AppActorPurchaseStatus {
  if (value === 'success') {
    return AppActorPurchaseStatus.Purchased;
  }
  return fromEnumValue(
    Object.values(AppActorPurchaseStatus),
    value,
    AppActorPurchaseStatus.Unknown
  );
}

function parseVerificationResult(value: unknown): AppActorVerificationResult {
  return fromEnumValue(
    Object.values(AppActorVerificationResult),
    value,
    AppActorVerificationResult.NotRequested
  );
}

export function appActorLogLevelWireValue(value: AppActorLogLevel): string {
  return value;
}

export function appActorLogLevelFromString(value: string): AppActorLogLevel {
  return fromEnumValue(
    Object.values(AppActorLogLevel),
    value,
    AppActorLogLevel.Info
  );
}

export function appActorStoreWireValue(value: AppActorStore): string {
  return value;
}

export function appActorStoreFromString(value: string): AppActorStore {
  return parseStore(value);
}

export function appActorPackageTypeWireValue(
  value: AppActorPackageType
): string {
  return value;
}

export function appActorPackageTypeFromString(
  value: string
): AppActorPackageType {
  return parsePackageType(value);
}

export function appActorProductTypeWireValue(
  value: AppActorProductType
): string {
  return value;
}

export function appActorProductTypeFromString(
  value: string
): AppActorProductType {
  return parseProductType(value);
}

export function appActorOwnershipTypeWireValue(
  value: AppActorOwnershipType
): string {
  return value;
}

export function appActorOwnershipTypeFromString(
  value: string
): AppActorOwnershipType {
  return parseOwnershipType(value);
}

export function appActorPeriodTypeWireValue(
  value: AppActorPeriodType
): string {
  return value;
}

export function appActorPeriodTypeFromString(value: string): AppActorPeriodType {
  return parsePeriodType(value);
}

export function appActorSubscriptionStatusWireValue(
  value: AppActorSubscriptionStatus
): string {
  return value;
}

export function appActorSubscriptionStatusFromString(
  value: string
): AppActorSubscriptionStatus {
  return parseSubscriptionStatus(value);
}

export function appActorCancellationReasonWireValue(
  value: AppActorCancellationReason
): string {
  return value;
}

export function appActorCancellationReasonFromString(
  value: string
): AppActorCancellationReason {
  return parseCancellationReason(value);
}

export function appActorConfigValueTypeWireValue(
  value: AppActorConfigValueType
): string {
  return value;
}

export function appActorConfigValueTypeFromString(
  value: string
): AppActorConfigValueType {
  return parseConfigValueType(value);
}

export function appActorStoreCapabilityWireValue(
  value: AppActorStoreCapability
): string {
  return value;
}

export function appActorStoreCapabilityFromString(
  value: string | null | undefined
): AppActorStoreCapability | null {
  if (value == null) {
    return null;
  }
  return parseStoreCapability(value);
}

export function appActorSubscriptionReplacementModeWireValue(
  value: AppActorSubscriptionReplacementMode
): string {
  return value;
}

export function appActorSubscriptionReplacementModeFromString(
  value: string | null | undefined
): AppActorSubscriptionReplacementMode | null {
  if (value == null) {
    return null;
  }
  const parsed = fromEnumValue(
    Object.values(AppActorSubscriptionReplacementMode),
    value,
    '' as AppActorSubscriptionReplacementMode,
    {
      withTimeProration: AppActorSubscriptionReplacementMode.WithTimeProration,
      chargeProrated: AppActorSubscriptionReplacementMode.ChargeProrated,
      withoutProration: AppActorSubscriptionReplacementMode.WithoutProration,
      chargeFullPrice: AppActorSubscriptionReplacementMode.ChargeFullPrice,
    }
  );
  return parsed || null;
}

export function appActorIntegrationIdentifierWireValue(
  value: AppActorIntegrationIdentifier
): string {
  return value;
}

export function appActorIntegrationIdentifierFromString(
  value: string | null | undefined
): AppActorIntegrationIdentifier | null {
  if (value == null) {
    return null;
  }
  const parsed = fromEnumValue(
    Object.values(AppActorIntegrationIdentifier),
    value,
    '' as AppActorIntegrationIdentifier,
    {
      appsFlyerId: AppActorIntegrationIdentifier.AppsFlyerId,
      adjustId: AppActorIntegrationIdentifier.AdjustId,
      branchId: AppActorIntegrationIdentifier.BranchId,
      firebaseAppInstanceId:
        AppActorIntegrationIdentifier.FirebaseAppInstanceId,
      amplitudeUserId: AppActorIntegrationIdentifier.AmplitudeUserId,
      amplitudeDeviceId: AppActorIntegrationIdentifier.AmplitudeDeviceId,
      mixpanelDistinctId: AppActorIntegrationIdentifier.MixpanelDistinctId,
      facebookAnonymousId: AppActorIntegrationIdentifier.FacebookAnonymousId,
      oneSignalPlayerId: AppActorIntegrationIdentifier.OneSignalPlayerId,
    }
  );
  return parsed || null;
}

export function appActorAttributionProviderWireValue(
  value: AppActorAttributionProvider
): string {
  return value;
}

export function appActorAttributionProviderFromString(
  value: string | null | undefined
): AppActorAttributionProvider | null {
  if (value == null) {
    return null;
  }
  const parsed = fromEnumValue(
    Object.values(AppActorAttributionProvider),
    value,
    '' as AppActorAttributionProvider,
    {
      appleSearchAds: AppActorAttributionProvider.AppleSearchAds,
      googleAds: AppActorAttributionProvider.GoogleAds,
      appsFlyer: AppActorAttributionProvider.AppsFlyer,
    }
  );
  return parsed || null;
}

export function appActorAttributionStatusWireValue(
  value: AppActorAttributionStatus
): string {
  return value;
}

export function appActorAttributionStatusFromString(
  value: string | null | undefined
): AppActorAttributionStatus | null {
  if (value == null) {
    return null;
  }
  const parsed = fromEnumValue(
    Object.values(AppActorAttributionStatus),
    value,
    '' as AppActorAttributionStatus,
    {
      nonOrganic: AppActorAttributionStatus.NonOrganic,
    }
  );
  return parsed || null;
}

export function appActorPurchaseStatusWireValue(
  value: AppActorPurchaseStatus
): string {
  return value;
}

export function appActorPurchaseStatusFromString(
  value: string
): AppActorPurchaseStatus {
  return parsePurchaseStatus(value);
}

export function appActorVerificationResultWireValue(
  value: AppActorVerificationResult
): string {
  return value;
}

export function appActorVerificationResultIsVerified(
  value: AppActorVerificationResult
): boolean {
  return (
    value === AppActorVerificationResult.Verified ||
    value === AppActorVerificationResult.VerifiedOnDevice
  );
}

export function appActorVerificationResultFromString(
  value: string
): AppActorVerificationResult {
  return parseVerificationResult(value);
}

export class AppActorError extends Error {
  readonly code: number;
  readonly detail?: string;
  readonly requestId?: string;
  readonly scope?: string;
  readonly retryAfterSeconds?: number;

  static readonly codeNotConfigured = 2001;
  static readonly codeAlreadyConfigured = 2002;
  static readonly codeValidation = 2003;
  static readonly codeNotAvailable = 2004;
  static readonly codeNetwork = 2005;
  static readonly codeDecoding = 2006;
  static readonly codeServer = 2007;
  static readonly codeStoreProductsMissing = 2008;
  static readonly codeCustomerNotFound = 2009;
  static readonly codePurchaseFailed = 2010;
  static readonly codeReceiptPostFailed = 2011;
  static readonly codeReceiptQueuedForRetry = 2012;
  static readonly codePurchaseInProgress = 2013;
  static readonly codeProductNotAvailable = 2014;
  static readonly codeSignatureVerification = 2015;
  static readonly codeInvalidOffer = 2016;
  static readonly codePurchaseIneligible = 2017;
  static readonly codeUnknown = 2099;

  constructor(options: {
    code: number;
    message: string;
    detail?: string;
    requestId?: string;
    scope?: string;
    retryAfterSeconds?: number;
  }) {
    super(options.message);
    this.name = 'AppActorError';
    this.code = options.code;
    this.detail = options.detail;
    this.requestId = options.requestId;
    this.scope = options.scope;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }

  get isPluginError(): boolean {
    return this.code >= 1000 && this.code < 2000;
  }

  get isSdkError(): boolean {
    return this.code >= 2000;
  }

  get isTransient(): boolean {
    return this.detail?.includes('transient=true') === true;
  }

  static fromJson(json: JsonObject): AppActorError {
    return new AppActorError({
      code: optionalInteger(json.code, 'code') ?? 0,
      message: asString(json.message) ?? 'Unknown error',
      detail: asString(json.detail),
      requestId: asString(json.request_id),
      scope: asString(json.scope),
      retryAfterSeconds: optionalNumber(
        json.retry_after_seconds,
        'retry_after_seconds'
      ),
    });
  }
}

export class UnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedError';
  }
}

export class AppActorOptions {
  constructor(public readonly logLevel?: AppActorLogLevel) {}

  toJson(): JsonObject {
    return this.logLevel ? { log_level: this.logLevel } : {};
  }
}

export class AppActorPlatformKeys {
  constructor(
    public readonly ios: string,
    public readonly android: string
  ) {}
}

export class AppActorAsaOptions {
  constructor(
    public readonly autoTrackPurchases = true,
    public readonly trackInSandbox = false,
    public readonly debugMode = false
  ) {}

  toJson(): JsonObject {
    return {
      auto_track_purchases: this.autoTrackPurchases,
      track_in_sandbox: this.trackInSandbox,
      debug_mode: this.debugMode,
    };
  }
}

export class AppActorAttributeValue {
  private constructor(
    public readonly value: unknown,
    public readonly valueType?: string
  ) {}

  static string(value: string): AppActorAttributeValue {
    return new AppActorAttributeValue(value);
  }

  static number(value: number): AppActorAttributeValue {
    return new AppActorAttributeValue(value);
  }

  static boolean(value: boolean): AppActorAttributeValue {
    return new AppActorAttributeValue(value);
  }

  static stringList(value: string[]): AppActorAttributeValue {
    return new AppActorAttributeValue(value);
  }

  static numberList(value: number[]): AppActorAttributeValue {
    return new AppActorAttributeValue(value);
  }

  static boolList(value: boolean[]): AppActorAttributeValue {
    return new AppActorAttributeValue(value);
  }

  static dateTime(value: Date): AppActorAttributeValue {
    return new AppActorAttributeValue(value.toISOString(), 'date');
  }

  toJson(): unknown {
    if (this.valueType) {
      return { value: this.value, valueType: this.valueType };
    }
    return normalizeAttributeValue(this.value);
  }
}

export class AppActorAttribution {
  readonly provider: AppActorAttributionProvider;
  readonly providerOverride?: string;
  readonly status?: AppActorAttributionStatus;
  readonly providerName?: string;
  readonly campaignId?: string;
  readonly campaignName?: string;
  readonly adGroupId?: string;
  readonly adGroupName?: string;
  readonly adId?: string;
  readonly adName?: string;
  readonly creativeId?: string;
  readonly creativeName?: string;
  readonly keywordId?: string;
  readonly keyword?: string;
  readonly network?: string;
  readonly source?: string;
  readonly medium?: string;
  readonly campaign?: string;
  readonly adGroup?: string;
  readonly ad?: string;
  readonly creative?: string;
  readonly clickId?: string;
  readonly attributedAt?: Date;
  readonly metadata: AppActorKeyValueInput;

  constructor(options: {
    provider: AppActorAttributionProvider;
    providerOverride?: string;
    status?: AppActorAttributionStatus;
    providerName?: string;
    campaignId?: string;
    campaignName?: string;
    adGroupId?: string;
    adGroupName?: string;
    adId?: string;
    adName?: string;
    creativeId?: string;
    creativeName?: string;
    keywordId?: string;
    keyword?: string;
    network?: string;
    source?: string;
    medium?: string;
    campaign?: string;
    adGroup?: string;
    ad?: string;
    creative?: string;
    clickId?: string;
    attributedAt?: Date;
    metadata?: AppActorKeyValueInput;
  });
  constructor(
    provider: AppActorAttributionProvider,
    providerOverride?: string,
    status?: AppActorAttributionStatus,
    providerName?: string,
    campaignId?: string,
    campaignName?: string,
    adGroupId?: string,
    adGroupName?: string,
    adId?: string,
    adName?: string,
    creativeId?: string,
    creativeName?: string,
    keywordId?: string,
    keyword?: string,
    network?: string,
    source?: string,
    medium?: string,
    campaign?: string,
    adGroup?: string,
    ad?: string,
    creative?: string,
    clickId?: string,
    attributedAt?: Date,
    metadata?: AppActorKeyValueInput
  );
  constructor(
    providerOrOptions:
      | AppActorAttributionProvider
      | {
          provider: AppActorAttributionProvider;
          providerOverride?: string;
          status?: AppActorAttributionStatus;
          providerName?: string;
          campaignId?: string;
          campaignName?: string;
          adGroupId?: string;
          adGroupName?: string;
          adId?: string;
          adName?: string;
          creativeId?: string;
          creativeName?: string;
          keywordId?: string;
          keyword?: string;
          network?: string;
          source?: string;
          medium?: string;
          campaign?: string;
          adGroup?: string;
          ad?: string;
          creative?: string;
          clickId?: string;
          attributedAt?: Date;
          metadata?: AppActorKeyValueInput;
        },
    providerOverride?: string,
    status?: AppActorAttributionStatus,
    providerName?: string,
    campaignId?: string,
    campaignName?: string,
    adGroupId?: string,
    adGroupName?: string,
    adId?: string,
    adName?: string,
    creativeId?: string,
    creativeName?: string,
    keywordId?: string,
    keyword?: string,
    network?: string,
    source?: string,
    medium?: string,
    campaign?: string,
    adGroup?: string,
    ad?: string,
    creative?: string,
    clickId?: string,
    attributedAt?: Date,
    metadata: AppActorKeyValueInput = {}
  ) {
    if (isRecord(providerOrOptions) && typeof providerOrOptions.provider === 'string') {
      this.provider = providerOrOptions.provider as AppActorAttributionProvider;
      this.providerOverride = asString(providerOrOptions.providerOverride);
      this.status = providerOrOptions.status as
        | AppActorAttributionStatus
        | undefined;
      this.providerName = asString(providerOrOptions.providerName);
      this.campaignId = asString(providerOrOptions.campaignId);
      this.campaignName = asString(providerOrOptions.campaignName);
      this.adGroupId = asString(providerOrOptions.adGroupId);
      this.adGroupName = asString(providerOrOptions.adGroupName);
      this.adId = asString(providerOrOptions.adId);
      this.adName = asString(providerOrOptions.adName);
      this.creativeId = asString(providerOrOptions.creativeId);
      this.creativeName = asString(providerOrOptions.creativeName);
      this.keywordId = asString(providerOrOptions.keywordId);
      this.keyword = asString(providerOrOptions.keyword);
      this.network = asString(providerOrOptions.network);
      this.source = asString(providerOrOptions.source);
      this.medium = asString(providerOrOptions.medium);
      this.campaign = asString(providerOrOptions.campaign);
      this.adGroup = asString(providerOrOptions.adGroup);
      this.ad = asString(providerOrOptions.ad);
      this.creative = asString(providerOrOptions.creative);
      this.clickId = asString(providerOrOptions.clickId);
      this.attributedAt =
        providerOrOptions.attributedAt instanceof Date
          ? providerOrOptions.attributedAt
          : undefined;
      this.metadata = providerOrOptions.metadata ?? {};
      return;
    }

    this.provider = providerOrOptions as AppActorAttributionProvider;
    this.providerOverride = providerOverride;
    this.status = status;
    this.providerName = providerName;
    this.campaignId = campaignId;
    this.campaignName = campaignName;
    this.adGroupId = adGroupId;
    this.adGroupName = adGroupName;
    this.adId = adId;
    this.adName = adName;
    this.creativeId = creativeId;
    this.creativeName = creativeName;
    this.keywordId = keywordId;
    this.keyword = keyword;
    this.network = network;
    this.source = source;
    this.medium = medium;
    this.campaign = campaign;
    this.adGroup = adGroup;
    this.ad = ad;
    this.creative = creative;
    this.clickId = clickId;
    this.attributedAt = attributedAt;
    this.metadata = metadata;
  }

  static customProvider(
    provider: string,
    options: {
      status?: AppActorAttributionStatus;
      providerName?: string;
      campaignId?: string;
      campaignName?: string;
      adGroupId?: string;
      adGroupName?: string;
      adId?: string;
      adName?: string;
      creativeId?: string;
      creativeName?: string;
      keywordId?: string;
      keyword?: string;
      network?: string;
      source?: string;
      medium?: string;
      campaign?: string;
      adGroup?: string;
      ad?: string;
      creative?: string;
      clickId?: string;
      attributedAt?: Date;
      metadata?: AppActorKeyValueInput;
    } = {}
  ): AppActorAttribution {
    return new AppActorAttribution({
      provider: AppActorAttributionProvider.Custom,
      providerOverride: provider,
      ...options,
    });
  }

  toJson(): JsonObject {
    validateAttributionProvider(this.providerOverride);
    validateAttributionString('provider_name', this.providerName);
    validateAttributionString('campaign_id', this.campaignId);
    validateAttributionString('campaign_name', this.campaignName);
    validateAttributionString('ad_group_id', this.adGroupId);
    validateAttributionString('ad_group_name', this.adGroupName);
    validateAttributionString('ad_id', this.adId);
    validateAttributionString('ad_name', this.adName);
    validateAttributionString('creative_id', this.creativeId);
    validateAttributionString('creative_name', this.creativeName);
    validateAttributionString('keyword_id', this.keywordId);
    validateAttributionString('keyword', this.keyword);
    validateAttributionString('network', this.network);
    validateAttributionString('source', this.source);
    validateAttributionString('medium', this.medium);
    validateAttributionString('campaign', this.campaign);
    validateAttributionString('ad_group', this.adGroup);
    validateAttributionString('ad', this.ad);
    validateAttributionString('creative', this.creative);
    validateAttributionString('click_id', this.clickId);

    const metadata = normalizeMetadata(this.metadata);

    return {
      provider: this.providerOverride ?? this.provider,
      ...(this.status ? { status: this.status } : {}),
      ...(this.providerName ? { provider_name: this.providerName } : {}),
      ...(this.campaignId ? { campaign_id: this.campaignId } : {}),
      ...(this.campaignName ? { campaign_name: this.campaignName } : {}),
      ...(this.adGroupId ? { ad_group_id: this.adGroupId } : {}),
      ...(this.adGroupName ? { ad_group_name: this.adGroupName } : {}),
      ...(this.adId ? { ad_id: this.adId } : {}),
      ...(this.adName ? { ad_name: this.adName } : {}),
      ...(this.creativeId ? { creative_id: this.creativeId } : {}),
      ...(this.creativeName ? { creative_name: this.creativeName } : {}),
      ...(this.keywordId ? { keyword_id: this.keywordId } : {}),
      ...(this.keyword ? { keyword: this.keyword } : {}),
      ...(this.network ? { network: this.network } : {}),
      ...(this.source ? { source: this.source } : {}),
      ...(this.medium ? { medium: this.medium } : {}),
      ...(this.campaign ? { campaign: this.campaign } : {}),
      ...(this.adGroup ? { ad_group: this.adGroup } : {}),
      ...(this.ad ? { ad: this.ad } : {}),
      ...(this.creative ? { creative: this.creative } : {}),
      ...(this.clickId ? { click_id: this.clickId } : {}),
      ...(this.attributedAt
        ? { attributed_at: this.attributedAt.toISOString() }
        : {}),
      ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
    };
  }
}

export class AppActorSdkLogEvent {
  constructor(
    public readonly level: string,
    public readonly message: string,
    public readonly category: string,
    public readonly timestamp: Date | null
  ) {}

  static fromJson(json: JsonObject): AppActorSdkLogEvent {
    const rawTimestamp = asString(json.timestamp);
    const timestamp =
      rawTimestamp != null && !Number.isNaN(Date.parse(rawTimestamp))
        ? new Date(rawTimestamp)
        : null;

    return new AppActorSdkLogEvent(
      asString(json.level) ?? '',
      asString(json.message) ?? '',
      asString(json.category) ?? '',
      timestamp
    );
  }
}

export class AppActorStorefront {
  constructor(
    public readonly store: AppActorStore,
    public readonly countryCode?: string
  ) {}

  static fromJson(json: JsonObject): AppActorStorefront {
    return new AppActorStorefront(
      parseStore(json.store),
      asString(json.country_code)
    );
  }
}

export class AppActorAsaDiagnostics {
  constructor(
    public readonly attributionCompleted: boolean,
    public readonly pendingPurchaseEventCount: number,
    public readonly debugMode: boolean,
    public readonly autoTrackPurchases: boolean,
    public readonly trackInSandbox: boolean
  ) {}

  static fromJson(json: JsonObject): AppActorAsaDiagnostics {
    return new AppActorAsaDiagnostics(
      asBoolean(json.attribution_completed) ?? false,
      optionalInteger(
        json.pending_purchase_event_count,
        'pending_purchase_event_count'
      ) ?? 0,
      asBoolean(json.debug_mode) ?? false,
      asBoolean(json.auto_track_purchases) ?? false,
      asBoolean(json.track_in_sandbox) ?? false
    );
  }
}

export class AppActorExperimentAssignment {
  constructor(
    public readonly experimentId: string,
    public readonly experimentKey: string,
    public readonly variantId: string,
    public readonly variantKey: string,
    public readonly payload: unknown,
    public readonly valueType: AppActorConfigValueType,
    public readonly assignedAt: string
  ) {}

  equals(other: unknown): boolean {
    return (
      other instanceof AppActorExperimentAssignment &&
      appActorModelEquals(this, other)
    );
  }

  static fromJson(json: JsonObject): AppActorExperimentAssignment {
    return new AppActorExperimentAssignment(
      asString(json.experiment_id) ?? '',
      asString(json.experiment_key) ?? '',
      asString(json.variant_id) ?? '',
      asString(json.variant_key) ?? '',
      json.payload,
      parseConfigValueType(json.value_type ?? 'string'),
      asString(json.assigned_at) ?? ''
    );
  }
}

export class AppActorReceiptPipelineEvent {
  static readonly typePostedOk = 'posted_ok';
  static readonly typeRetryScheduled = 'retry_scheduled';
  static readonly typePermanentlyRejected = 'permanently_rejected';
  static readonly typeDeadLettered = 'dead_lettered';
  static readonly typeDuplicateSkipped = 'duplicate_skipped';

  constructor(
    public readonly type: string,
    public readonly transactionId: string | undefined,
    public readonly productId: string,
    public readonly appUserId: string,
    public readonly retryCount?: number,
    public readonly nextAttemptAt?: string,
    public readonly errorCode?: string,
    public readonly key?: string
  ) {}

  get isPostedOk(): boolean {
    return this.type === AppActorReceiptPipelineEvent.typePostedOk;
  }

  get isRetryScheduled(): boolean {
    return this.type === AppActorReceiptPipelineEvent.typeRetryScheduled;
  }

  get isPermanentlyRejected(): boolean {
    return this.type === AppActorReceiptPipelineEvent.typePermanentlyRejected;
  }

  get isDeadLettered(): boolean {
    return this.type === AppActorReceiptPipelineEvent.typeDeadLettered;
  }

  get isDuplicateSkipped(): boolean {
    return this.type === AppActorReceiptPipelineEvent.typeDuplicateSkipped;
  }

  static fromJson(json: JsonObject): AppActorReceiptPipelineEvent {
    return new AppActorReceiptPipelineEvent(
      asString(json.type) ?? '',
      asString(json.transaction_id),
      asString(json.product_id) ?? '',
      asString(json.app_user_id) ?? '',
      optionalInteger(json.retry_count, 'retry_count'),
      asString(json.next_attempt_at),
      asString(json.error_code),
      asString(json.key)
    );
  }
}

export class AppActorPurchaseIntent {
  constructor(
    public readonly intentId: string,
    public readonly productId: string,
    public readonly offerId?: string,
    public readonly offerType?: string
  ) {}

  static fromJson(json: JsonObject): AppActorPurchaseIntent {
    return new AppActorPurchaseIntent(
      asString(json.intent_id) ?? '',
      asString(json.product_id) ?? '',
      asString(json.offer_id),
      asString(json.offer_type)
    );
  }
}

export class AppActorTokenBalance {
  constructor(
    public readonly renewable: number,
    public readonly nonRenewable: number,
    public readonly total: number
  ) {}

  static fromJson(json: JsonObject): AppActorTokenBalance {
    return new AppActorTokenBalance(
      optionalInteger(json.renewable, 'renewable') ?? 0,
      optionalInteger(json.non_renewable, 'non_renewable') ?? 0,
      optionalInteger(json.total, 'total') ?? 0
    );
  }
}

export class AppActorEntitlementInfo {
  constructor(
    public readonly identifier: string,
    public readonly isActive: boolean,
    public readonly status?: string,
    public readonly productIdentifier?: string,
    public readonly grantedBy?: string,
    public readonly ownershipType: AppActorOwnershipType = AppActorOwnershipType.Unknown,
    public readonly periodType: AppActorPeriodType = AppActorPeriodType.Normal,
    public readonly willRenew = false,
    public readonly subscriptionStatus?: AppActorSubscriptionStatus,
    public readonly store: AppActorStore = AppActorStore.Unknown,
    public readonly basePlanId?: string,
    public readonly offerId?: string,
    public readonly isSandbox?: boolean,
    public readonly cancellationReason?: AppActorCancellationReason,
    public readonly purchaseDate?: string,
    public readonly startsAt?: string,
    public readonly latestPurchaseDate?: string,
    public readonly originalPurchaseDate?: string,
    public readonly expirationDate?: string,
    public readonly gracePeriodExpiresAt?: string,
    public readonly billingIssueDetectedAt?: string,
    public readonly unsubscribeDetectedAt?: string,
    public readonly renewedAt?: string,
    public readonly activePromotionalOfferType?: string,
    public readonly activePromotionalOfferId?: string
  ) {}

  static fromJson(json: JsonObject): AppActorEntitlementInfo {
    return new AppActorEntitlementInfo(
      asString(json.identifier) ?? '',
      asBoolean(json.is_active) ?? false,
      asString(json.status),
      asString(json.product_identifier),
      asString(json.granted_by),
      parseOwnershipType(json.ownership_type),
      parsePeriodType(json.period_type ?? AppActorPeriodType.Normal),
      asBoolean(json.will_renew) ?? false,
      json.subscription_status != null
        ? parseSubscriptionStatus(json.subscription_status)
        : undefined,
      parseStore(json.store),
      asString(json.base_plan_id),
      asString(json.offer_id),
      asBoolean(json.is_sandbox),
      json.cancellation_reason != null
        ? parseCancellationReason(json.cancellation_reason)
        : undefined,
      asString(json.purchase_date),
      asString(json.starts_at),
      asString(json.latest_purchase_date),
      asString(json.original_purchase_date),
      asString(json.expiration_date),
      asString(json.grace_period_expires_at),
      asString(json.billing_issue_detected_at),
      asString(json.unsubscribe_detected_at),
      asString(json.renewed_at),
      asString(json.active_promotional_offer_type),
      asString(json.active_promotional_offer_id)
    );
  }
}

export class AppActorSubscriptionInfo {
  constructor(
    public readonly subscriptionKey: string,
    public readonly productIdentifier: string,
    public readonly store: AppActorStore = AppActorStore.Unknown,
    public readonly basePlanId?: string,
    public readonly offerId?: string,
    public readonly isActive = false,
    public readonly expiresDate?: string,
    public readonly purchaseDate?: string,
    public readonly startsAt?: string,
    public readonly periodType?: AppActorPeriodType,
    public readonly status?: string,
    public readonly autoRenew?: boolean,
    public readonly isSandbox?: boolean,
    public readonly gracePeriodExpiresAt?: string,
    public readonly unsubscribeDetectedAt?: string,
    public readonly cancellationReason?: AppActorCancellationReason,
    public readonly renewedAt?: string,
    public readonly originalTransactionId?: string,
    public readonly latestTransactionId?: string,
    public readonly activePromotionalOfferType?: string,
    public readonly activePromotionalOfferId?: string
  ) {}

  static fromJson(json: JsonObject): AppActorSubscriptionInfo {
    return new AppActorSubscriptionInfo(
      asString(json.subscription_key) ?? '',
      asString(json.product_identifier) ?? '',
      parseStore(json.store),
      asString(json.base_plan_id),
      asString(json.offer_id),
      asBoolean(json.is_active) ?? false,
      asString(json.expires_date),
      asString(json.purchase_date),
      asString(json.starts_at),
      json.period_type != null ? parsePeriodType(json.period_type) : undefined,
      asString(json.status),
      asBoolean(json.auto_renew),
      asBoolean(json.is_sandbox),
      asString(json.grace_period_expires_at),
      asString(json.unsubscribe_detected_at),
      json.cancellation_reason != null
        ? parseCancellationReason(json.cancellation_reason)
        : undefined,
      asString(json.renewed_at),
      asString(json.original_transaction_id),
      asString(json.latest_transaction_id),
      asString(json.active_promotional_offer_type),
      asString(json.active_promotional_offer_id)
    );
  }
}

export class AppActorNonSubscription {
  constructor(
    public readonly productIdentifier: string,
    public readonly store: AppActorStore = AppActorStore.Unknown,
    public readonly basePlanId?: string,
    public readonly offerId?: string,
    public readonly originalTransactionIdentifier?: string,
    public readonly purchaseDate?: string,
    public readonly storeTransactionIdentifier?: string,
    public readonly isSandbox?: boolean,
    public readonly isConsumable?: boolean,
    public readonly isRefund?: boolean
  ) {}

  static fromJson(json: JsonObject): AppActorNonSubscription {
    return new AppActorNonSubscription(
      asString(json.product_identifier) ?? '',
      parseStore(json.store),
      asString(json.base_plan_id),
      asString(json.offer_id),
      asString(json.original_transaction_identifier),
      asString(json.purchase_date),
      asString(json.store_transaction_identifier),
      asBoolean(json.is_sandbox),
      asBoolean(json.is_consumable),
      asBoolean(json.is_refund)
    );
  }
}

export class AppActorCustomerInfo {
  constructor(
    public readonly entitlements: JsonMap<AppActorEntitlementInfo> = {},
    public readonly subscriptions: JsonMap<AppActorSubscriptionInfo> = {},
    public readonly nonSubscriptions: JsonMap<AppActorNonSubscription[]> = {},
    public readonly consumableBalances?: JsonMap<number>,
    public readonly tokenBalance?: AppActorTokenBalance,
    public readonly snapshotDate?: string,
    public readonly appUserId?: string,
    public readonly requestId?: string,
    public readonly requestDate?: string,
    public readonly firstSeen?: string,
    public readonly lastSeen?: string,
    public readonly managementUrl?: string,
    public readonly isComputedOffline = false,
    public readonly productEntitlements: JsonMap<string[]> = {},
    public readonly activeEntitlementKeys: Set<string> = new Set(),
    public readonly verification = AppActorVerificationResult.NotRequested
  ) {}

  get activeEntitlements(): JsonMap<AppActorEntitlementInfo> {
    return Object.fromEntries(
      Object.entries(this.entitlements).filter(([, value]) => value.isActive)
    );
  }

  hasActiveEntitlement(key: string): boolean {
    return this.activeEntitlementKeys.has(key);
  }

  equals(other: unknown): boolean {
    return (
      other instanceof AppActorCustomerInfo && appActorModelEquals(this, other)
    );
  }

  static fromJson(json: JsonObject): AppActorCustomerInfo {
    const consumableBalances =
      json.consumable_balances != null
        ? Object.fromEntries(
            Object.entries(
              requireRecord(json.consumable_balances, 'consumable_balances')
            ).map(([key, value]) => [
              key,
              requireInteger(value, `consumable_balances.${key}`),
            ])
          )
        : undefined;

    return new AppActorCustomerInfo(
      mapValues(json.entitlements, AppActorEntitlementInfo.fromJson),
      mapValues(json.subscriptions, AppActorSubscriptionInfo.fromJson),
      mapListValues(json.non_subscriptions, AppActorNonSubscription.fromJson),
      consumableBalances,
      json.token_balance != null
        ? AppActorTokenBalance.fromJson(
            requireRecord(json.token_balance, 'token_balance')
          )
        : undefined,
      asString(json.snapshot_date),
      asString(json.app_user_id),
      asString(json.request_id),
      asString(json.request_date),
      asString(json.first_seen),
      asString(json.last_seen),
      asString(json.management_url),
      asBoolean(json.is_computed_offline) ?? false,
      mapStringLists(json.product_entitlements),
      new Set(
        optionalStringArray(
          json.active_entitlement_keys,
          'active_entitlement_keys'
        )
      ),
      parseVerificationResult(json.verification)
    );
  }
}

export class AppActorPackage {
  constructor(
    public readonly id: string,
    public readonly packageType: AppActorPackageType,
    public readonly productId: string,
    public readonly storeProductId?: string,
    public readonly productType = AppActorProductType.Unknown,
    public readonly store = AppActorStore.Unknown,
    public readonly basePlanId?: string,
    public readonly offerId?: string,
    public readonly localizedPriceString?: string,
    public readonly priceAmountMicros?: number,
    public readonly price?: number,
    public readonly currencyCode?: string,
    public readonly displayName?: string,
    public readonly productName?: string,
    public readonly productDescription?: string,
    public readonly metadata?: Record<string, string>,
    public readonly tokenAmount?: number,
    public readonly position?: number,
    public readonly serverId?: string,
    public readonly offeringId?: string
  ) {}

  toPurchaseParams(): JsonObject {
    return {
      package_id: this.id,
      ...(this.storeProductId != null
        ? { store_product_id: this.storeProductId }
        : {}),
      product_id: this.productId,
      product_type: this.productType,
      store: this.store,
      ...(this.basePlanId != null ? { base_plan_id: this.basePlanId } : {}),
      ...(this.offerId != null ? { offer_id: this.offerId } : {}),
      ...(this.offeringId != null ? { offering_id: this.offeringId } : {}),
    };
  }

  toJson(): JsonObject {
    return this.toPurchaseParams();
  }

  equals(other: unknown): boolean {
    return other instanceof AppActorPackage && appActorModelEquals(this, other);
  }

  static fromJson(json: JsonObject): AppActorPackage {
    return new AppActorPackage(
      asString(json.id) ?? '',
      parsePackageType(json.package_type),
      asString(json.product_id) ?? '',
      asString(json.store_product_id),
      parseProductType(json.product_type),
      parseStore(json.store),
      asString(json.base_plan_id),
      asString(json.offer_id),
      asString(json.localized_price_string),
      optionalInteger(json.price_amount_micros, 'price_amount_micros'),
      optionalNumber(json.price, 'price'),
      asString(json.currency_code),
      asString(json.display_name),
      asString(json.product_name),
      asString(json.product_description),
      mapStringRecord(json.metadata, 'metadata'),
      optionalInteger(json.token_amount, 'token_amount'),
      optionalInteger(json.position, 'position'),
      asString(json.server_id),
      asString(json.offering_id)
    );
  }
}

export class AppActorOffering {
  constructor(
    public readonly id: string,
    public readonly displayName: string,
    public readonly isCurrent = false,
    public readonly lookupKey?: string,
    public readonly metadata?: Record<string, string>,
    public readonly packages: AppActorPackage[] = []
  ) {}

  package(id: string): AppActorPackage | undefined {
    return this.packages.find((item) => item.id === id);
  }

  packageFor(type: AppActorPackageType): AppActorPackage | undefined {
    return this.packages.find((item) => item.packageType === type);
  }

  get weekly(): AppActorPackage | undefined {
    return this.packageFor(AppActorPackageType.Weekly);
  }

  get monthly(): AppActorPackage | undefined {
    return this.packageFor(AppActorPackageType.Monthly);
  }

  get twoMonth(): AppActorPackage | undefined {
    return this.packageFor(AppActorPackageType.TwoMonth);
  }

  get threeMonth(): AppActorPackage | undefined {
    return this.packageFor(AppActorPackageType.ThreeMonth);
  }

  get sixMonth(): AppActorPackage | undefined {
    return this.packageFor(AppActorPackageType.SixMonth);
  }

  get annual(): AppActorPackage | undefined {
    return this.packageFor(AppActorPackageType.Annual);
  }

  get lifetime(): AppActorPackage | undefined {
    return this.packageFor(AppActorPackageType.Lifetime);
  }

  equals(other: unknown): boolean {
    return other instanceof AppActorOffering && appActorModelEquals(this, other);
  }

  static fromJson(json: JsonObject): AppActorOffering {
    return new AppActorOffering(
      asString(json.id) ?? '',
      asString(json.display_name) ?? '',
      asBoolean(json.is_current) ?? false,
      asString(json.lookup_key),
      mapStringRecord(json.metadata, 'metadata'),
      Array.isArray(json.packages)
        ? json.packages.map((entry) =>
            AppActorPackage.fromJson(requireRecord(entry, 'packages[]'))
          )
        : []
    );
  }
}

export class AppActorOfferings {
  constructor(
    public readonly current: AppActorOffering | null = null,
    public readonly all: JsonMap<AppActorOffering> = {},
    public readonly productEntitlements: JsonMap<string[]> = {},
    public readonly verification = AppActorVerificationResult.NotRequested
  ) {}

  offering(id: string): AppActorOffering | undefined {
    return this.all[id];
  }

  offeringByLookupKey(lookupKey: string): AppActorOffering | undefined {
    return Object.values(this.all).find((item) => item.lookupKey === lookupKey);
  }

  equals(other: unknown): boolean {
    return (
      other instanceof AppActorOfferings && appActorModelEquals(this, other)
    );
  }

  static fromJson(json: JsonObject): AppActorOfferings {
    return new AppActorOfferings(
      json.current != null
        ? AppActorOffering.fromJson(requireRecord(json.current, 'current'))
        : null,
      mapValues(json.all, AppActorOffering.fromJson),
      mapStringLists(json.product_entitlements),
      parseVerificationResult(json.verification)
    );
  }
}

export class AppActorPurchaseInfo {
  constructor(
    public readonly store: AppActorStore,
    public readonly productId?: string,
    public readonly transactionId?: string,
    public readonly originalTransactionId?: string,
    public readonly purchaseDate?: string,
    public readonly isSandbox?: boolean
  ) {}

  static fromJson(json: JsonObject): AppActorPurchaseInfo {
    return new AppActorPurchaseInfo(
      parseStore(json.store),
      asString(json.product_id),
      asString(json.transaction_id),
      asString(json.original_transaction_id),
      asString(json.purchase_date),
      asBoolean(json.is_sandbox)
    );
  }
}

export class AppActorPurchaseResult {
  constructor(
    public readonly status: AppActorPurchaseStatus,
    public readonly customerInfo?: AppActorCustomerInfo,
    public readonly purchaseInfo?: AppActorPurchaseInfo
  ) {}

  get isPurchased(): boolean {
    return this.status === AppActorPurchaseStatus.Purchased;
  }

  get isCancelled(): boolean {
    return this.status === AppActorPurchaseStatus.Cancelled;
  }

  get isPending(): boolean {
    return this.status === AppActorPurchaseStatus.Pending;
  }

  get isRestored(): boolean {
    return this.status === AppActorPurchaseStatus.Restored;
  }

  equals(other: unknown): boolean {
    return (
      other instanceof AppActorPurchaseResult && appActorModelEquals(this, other)
    );
  }

  static fromJson(json: JsonObject): AppActorPurchaseResult {
    return new AppActorPurchaseResult(
      parsePurchaseStatus(json.status),
      json.customer_info != null
        ? AppActorCustomerInfo.fromJson(
            requireRecord(json.customer_info, 'customer_info')
          )
        : undefined,
      json.purchase_info != null
        ? AppActorPurchaseInfo.fromJson(
            requireRecord(json.purchase_info, 'purchase_info')
          )
        : undefined
    );
  }
}

export class AppActorRemoteConfigItem {
  constructor(
    public readonly key: string,
    public readonly value: unknown,
    public readonly valueType: AppActorConfigValueType
  ) {}

  get stringValue(): string | undefined {
    return typeof this.value === 'string' ? this.value : undefined;
  }

  get boolValue(): boolean | undefined {
    return typeof this.value === 'boolean' ? this.value : undefined;
  }

  get numberValue(): number | undefined {
    return typeof this.value === 'number' ? this.value : undefined;
  }

  equals(other: unknown): boolean {
    return (
      other instanceof AppActorRemoteConfigItem &&
      appActorModelEquals(this, other)
    );
  }

  static fromJson(json: JsonObject): AppActorRemoteConfigItem {
    return new AppActorRemoteConfigItem(
      asString(json.key) ?? '',
      json.value,
      parseConfigValueType(json.value_type ?? 'string')
    );
  }
}

export class AppActorRemoteConfigs {
  constructor(public readonly items: AppActorRemoteConfigItem[] = []) {}

  get(key: string): AppActorRemoteConfigItem | undefined {
    return this.items.find((item) => item.key === key);
  }

  equals(other: unknown): boolean {
    return (
      other instanceof AppActorRemoteConfigs && appActorModelEquals(this, other)
    );
  }

  static fromJson(json: JsonObject): AppActorRemoteConfigs {
    return new AppActorRemoteConfigs(
      Array.isArray(json.items)
        ? json.items.map((entry) =>
            AppActorRemoteConfigItem.fromJson(requireRecord(entry, 'items[]'))
          )
        : []
    );
  }
}

export class AppActorDeferredPurchaseEvent {
  constructor(
    public readonly productId: string,
    public readonly customerInfo: AppActorCustomerInfo
  ) {}

  static fromJson(json: JsonObject): AppActorDeferredPurchaseEvent {
    return new AppActorDeferredPurchaseEvent(
      asString(json.product_id) ?? '',
      AppActorCustomerInfo.fromJson(
        json.customer_info == null
          ? {}
          : requireRecord(json.customer_info, 'customer_info')
      )
    );
  }
}

class AppActorEventStream<T> {
  constructor(
    private readonly expectedName: string,
    private readonly decoder: (payload: JsonObject) => T
  ) {}

  addListener(listener: (value: T) => void): AppActorEventSubscription {
    if (!nativeEmitter) {
      throw new AppActorError({
        code: PLUGIN_ERROR_NATIVE_BRIDGE,
        message: 'AppActor native event emitter is not linked.',
      });
    }

    const subscription = nativeEmitter.addListener(
      NATIVE_EVENT_NAME,
      (event: NativeEventEnvelope) => {
        if (!event || event.name !== this.expectedName) {
          return;
        }
        const payload = decodeEventPayload(event.json);
        if (!payload) {
          return;
        }
        listener(this.decoder(payload));
      }
    );

    return { remove: () => subscription.remove() };
  }

  listen(listener: (value: T) => void): AppActorEventSubscription {
    return this.addListener(listener);
  }
}

type ConfigureOptions = {
  appUserId?: string;
  options?: AppActorOptions;
};

type PurchasePackageOptions = {
  offeringId?: string;
  oldPurchaseToken?: string;
  replacementMode?: AppActorSubscriptionReplacementMode;
  quantity?: number;
  placement?: string | null;
};

type RestorePurchasesOptions = {
  syncWithAppStore?: boolean;
};

export type AppActorSearchAdsOptions =
  | AppActorAsaOptions
  | {
      options?: AppActorAsaOptions;
    };

function resolveSearchAdsOptions(
  options?: AppActorSearchAdsOptions
): AppActorAsaOptions {
  if (options instanceof AppActorAsaOptions) {
    return options;
  }
  return options?.options ?? new AppActorAsaOptions();
}

export class AppActor {
  static readonly instance = new AppActor(APP_ACTOR_SINGLETON_GUARD);

  private stagedAsaOptions?: AppActorAsaOptions;

  private constructor(guard: symbol) {
    if (guard !== APP_ACTOR_SINGLETON_GUARD) {
      throw new Error(
        'AppActor cannot be instantiated directly. Use AppActor.instance.'
      );
    }
  }

  readonly onCustomerInfoUpdated = new AppActorEventStream(
    'customer_info_updated',
    AppActorCustomerInfo.fromJson
  );

  readonly onReceiptPipelineEvent = new AppActorEventStream(
    'receipt_pipeline_event',
    AppActorReceiptPipelineEvent.fromJson
  );

  readonly onPurchaseIntent = new AppActorEventStream(
    'purchase_intent_received',
    AppActorPurchaseIntent.fromJson
  );

  readonly onDeferredPurchaseResolved = new AppActorEventStream(
    'deferred_purchase_resolved',
    AppActorDeferredPurchaseEvent.fromJson
  );

  readonly onSdkLog = new AppActorEventStream(
    'sdk_log',
    AppActorSdkLogEvent.fromJson
  );

  enableSearchAdsTracking(options?: AppActorSearchAdsOptions): void {
    this.stagedAsaOptions = resolveSearchAdsOptions(options);
  }

  async configure(
    apiKey: string | AppActorPlatformKeys,
    options: ConfigureOptions = {}
  ): Promise<void> {
    ensureDebugSdkLogSubscription();
    const resolvedApiKey = resolveApiKey(apiKey);
    const payload: JsonObject = {
      api_key: resolvedApiKey,
      ...(options.appUserId !== undefined
        ? { app_user_id: options.appUserId }
        : {}),
      options: {
        ...(options.options?.toJson() ?? {}),
        platform_info: {
          flavor: 'react-native',
          version: appActorReactNativeVersion,
        },
      },
    };

    await execute(METHOD_NAMES.configure, payload);

    if (this.stagedAsaOptions && Platform.OS === 'ios') {
      await execute(
        METHOD_NAMES.enableAppleSearchAdsTracking,
        this.stagedAsaOptions.toJson()
      );
    }
  }

  async reset(): Promise<void> {
    await execute(METHOD_NAMES.reset);
    this.stagedAsaOptions = undefined;
    resetDebugSdkLogSubscription();
  }

  async sdkVersion(): Promise<string> {
    const response = await execute(METHOD_NAMES.getSdkVersion);
    return asString(response.value) ?? '';
  }

  async setLogLevel(level: AppActorLogLevel): Promise<void> {
    await execute(METHOD_NAMES.setLogLevel, { log_level: level });
  }

  async enableInstallReferrer(): Promise<void> {
    if (Platform.OS !== 'android') {
      return;
    }
    await execute(METHOD_NAMES.enableInstallReferrer);
  }

  async logIn(appUserId: string): Promise<AppActorCustomerInfo> {
    const response = await execute(METHOD_NAMES.logIn, {
      new_app_user_id: appUserId,
    });
    return AppActorCustomerInfo.fromJson(response);
  }

  async logOut(): Promise<boolean> {
    const response = await execute(METHOD_NAMES.logOut);
    return asBoolean(response.value) === true;
  }

  async getAppUserId(): Promise<string | null> {
    const response = await execute(METHOD_NAMES.getAppUserId);
    return asString(response.value) ?? null;
  }

  async getIsAnonymous(): Promise<boolean> {
    const response = await execute(METHOD_NAMES.getIsAnonymous);
    return asBoolean(response.value) === true;
  }

  async purchasePackage(
    pkg: AppActorPackage,
    options: PurchasePackageOptions = {}
  ): Promise<AppActorPurchaseResult> {
    if (options.quantity != null && options.quantity < 1) {
      throw new Error('Purchase quantity must be at least 1.');
    }

    const placement = normalizePlacement(options.placement);
    const offeringId = options.offeringId ?? pkg.offeringId;
    const payload: JsonObject = {
      package_id: pkg.id,
      ...(offeringId != null ? { offering_id: offeringId } : {}),
      ...(options.oldPurchaseToken
        ? { old_purchase_token: options.oldPurchaseToken }
        : {}),
      ...(options.replacementMode
        ? { replacement_mode: options.replacementMode }
        : {}),
      ...(options.quantity != null ? { quantity: options.quantity } : {}),
      ...(placement ? { placement } : {}),
    };

    const response = await execute(METHOD_NAMES.purchasePackage, payload);
    return AppActorPurchaseResult.fromJson(response);
  }

  async restorePurchases(
    options: RestorePurchasesOptions = {}
  ): Promise<AppActorCustomerInfo> {
    const response = await execute(METHOD_NAMES.restorePurchases, {
      ...(options.syncWithAppStore != null
        ? { sync_with_app_store: options.syncWithAppStore }
        : {}),
    });
    return AppActorCustomerInfo.fromJson(response);
  }

  async syncPurchases(): Promise<AppActorCustomerInfo> {
    return AppActorCustomerInfo.fromJson(
      await execute(METHOD_NAMES.syncPurchases)
    );
  }

  async quietSyncPurchases(): Promise<AppActorCustomerInfo> {
    return AppActorCustomerInfo.fromJson(
      await execute(METHOD_NAMES.quietSyncPurchases)
    );
  }

  async drainReceiptQueueAndRefreshCustomer(): Promise<AppActorCustomerInfo> {
    return AppActorCustomerInfo.fromJson(
      await execute(METHOD_NAMES.drainReceiptQueueAndRefreshCustomer)
    );
  }

  async setFallbackOfferings(
    bytes: Uint8Array | ArrayBuffer
  ): Promise<void> {
    const payload = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    await execute(METHOD_NAMES.setFallbackOfferings, {
      json_data: fromByteArray(payload),
    });
  }

  async getCustomerInfo(): Promise<AppActorCustomerInfo> {
    return AppActorCustomerInfo.fromJson(
      await execute(METHOD_NAMES.getCustomerInfo)
    );
  }

  async getOfferings(): Promise<AppActorOfferings> {
    return AppActorOfferings.fromJson(
      await execute(METHOD_NAMES.getOfferings)
    );
  }

  async activeEntitlementKeysOffline(): Promise<Set<string>> {
    const response = await execute(METHOD_NAMES.activeEntitlementKeysOffline);
    return new Set(asStringArray(response.keys));
  }

  async getCachedOfferings(): Promise<AppActorOfferings | null> {
    const response = await execute(METHOD_NAMES.getCachedOfferings);
    if (response.value == null && !('current' in response)) {
      return null;
    }
    return AppActorOfferings.fromJson(response);
  }

  async getCachedRemoteConfigs(): Promise<AppActorRemoteConfigs | null> {
    const response = await execute(METHOD_NAMES.getCachedRemoteConfigs);
    if (response.value == null && !('items' in response)) {
      return null;
    }
    return AppActorRemoteConfigs.fromJson(response);
  }

  async getCachedCustomerInfo(): Promise<AppActorCustomerInfo> {
    return AppActorCustomerInfo.fromJson(
      await execute(METHOD_NAMES.getCachedCustomerInfo)
    );
  }

  async canMakePurchases(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return true;
    }
    const response = await execute(METHOD_NAMES.canMakePurchases);
    return asBoolean(response.value) === true;
  }

  async getStorefront(): Promise<AppActorStorefront | null> {
    if (Platform.OS !== 'android') {
      return null;
    }
    const response = await execute(METHOD_NAMES.getStorefront);
    if (response.value == null && !('store' in response)) {
      return null;
    }
    return AppActorStorefront.fromJson(response);
  }

  async getStoreCapabilities(): Promise<Set<AppActorStoreCapability>> {
    if (Platform.OS !== 'android') {
      return new Set();
    }
    const response = await execute(METHOD_NAMES.getStoreCapabilities);
    const values = Array.isArray(response.value) ? response.value : [];
    return new Set(
      values
        .map((entry) => parseStoreCapability(entry))
        .filter((entry): entry is AppActorStoreCapability => entry != null)
    );
  }

  async setAttributes(attributes: AppActorKeyValueInput): Promise<void> {
    await execute(METHOD_NAMES.setAttributes, {
      attributes: normalizeAttributes(attributes),
    });
  }

  async setAttribute(key: string, value: unknown): Promise<void> {
    validateCustomKey(key);
    await execute(METHOD_NAMES.setAttribute, {
      key,
      value: normalizeAttributeValue(value),
    });
  }

  async unsetAttribute(key: string): Promise<void> {
    validateCustomKey(key);
    await execute(METHOD_NAMES.unsetAttribute, { key });
  }

  async setEmail(email: string | null): Promise<void> {
    if (email != null) {
      validateEmail(email);
    }
    await execute(METHOD_NAMES.setEmail, { email });
  }

  async setDisplayName(displayName: string | null): Promise<void> {
    await execute(METHOD_NAMES.setDisplayName, {
      display_name: displayName,
    });
  }

  async setPhoneNumber(phoneNumber: string | null): Promise<void> {
    if (phoneNumber != null) {
      validatePhoneNumber(phoneNumber);
    }
    await execute(METHOD_NAMES.setPhoneNumber, {
      phone_number: phoneNumber,
    });
  }

  async setPushToken(pushToken: string | null): Promise<void> {
    await execute(METHOD_NAMES.setPushToken, {
      push_token: pushToken,
    });
  }

  async collectDeviceIdentifiers(): Promise<void> {
    await execute(METHOD_NAMES.collectDeviceIdentifiers);
  }

  async setIntegrationIdentifier(
    type: AppActorIntegrationIdentifier,
    value: string
  ): Promise<void> {
    await this.setCustomIntegrationIdentifier(type, value);
  }

  async unsetIntegrationIdentifier(
    type: AppActorIntegrationIdentifier
  ): Promise<void> {
    await this.unsetCustomIntegrationIdentifier(type);
  }

  async setCustomIntegrationIdentifier(
    type: AppActorIntegrationIdentifier | string,
    value: string
  ): Promise<void> {
    validateIntegrationIdentifierType(String(type));
    validateIntegrationIdentifierValue(value);
    await execute(METHOD_NAMES.setIntegrationIdentifier, {
      type,
      value,
    });
  }

  async unsetCustomIntegrationIdentifier(
    type: AppActorIntegrationIdentifier | string
  ): Promise<void> {
    validateIntegrationIdentifierType(String(type));
    await execute(METHOD_NAMES.setIntegrationIdentifier, {
      type,
      value: null,
    });
  }

  async setAppsflyerID(value: string): Promise<void> {
    await this.setIntegrationIdentifier(
      AppActorIntegrationIdentifier.AppsFlyerId,
      value
    );
  }

  async setAppsFlyerID(value: string): Promise<void> {
    await this.setAppsflyerID(value);
  }

  async setAdjustID(value: string): Promise<void> {
    await this.setIntegrationIdentifier(
      AppActorIntegrationIdentifier.AdjustId,
      value
    );
  }

  async setBranchID(value: string): Promise<void> {
    await this.setIntegrationIdentifier(
      AppActorIntegrationIdentifier.BranchId,
      value
    );
  }

  async setFirebaseAppInstanceID(value: string): Promise<void> {
    await this.setIntegrationIdentifier(
      AppActorIntegrationIdentifier.FirebaseAppInstanceId,
      value
    );
  }

  async setOneSignalID(value: string): Promise<void> {
    await this.setIntegrationIdentifier(
      AppActorIntegrationIdentifier.OneSignalPlayerId,
      value
    );
  }

  async updateAttribution(attribution: AppActorAttribution): Promise<void> {
    const payload = attribution.toJson();
    await execute(METHOD_NAMES.updateAttribution, payload);
  }

  async setMediaSource(value: string | null): Promise<void> {
    await execute(METHOD_NAMES.setMediaSource, { value });
  }

  async setCampaign(value: string | null): Promise<void> {
    await execute(METHOD_NAMES.setCampaign, { value });
  }

  async setAdGroup(value: string | null): Promise<void> {
    await execute(METHOD_NAMES.setAdGroup, { value });
  }

  async setAd(value: string | null): Promise<void> {
    await execute(METHOD_NAMES.setAd, { value });
  }

  async setKeyword(value: string | null): Promise<void> {
    await execute(METHOD_NAMES.setKeyword, { value });
  }

  async setCreative(value: string | null): Promise<void> {
    await execute(METHOD_NAMES.setCreative, { value });
  }

  async getRemoteConfigs(): Promise<AppActorRemoteConfigs> {
    return AppActorRemoteConfigs.fromJson(
      await execute(METHOD_NAMES.getRemoteConfigs)
    );
  }

  async getExperimentAssignment(
    experimentKey: string
  ): Promise<AppActorExperimentAssignment | null> {
    const response = await execute(METHOD_NAMES.getExperimentAssignment, {
      experiment_key: experimentKey,
    });
    if (response.experiment_key == null) {
      return null;
    }
    return AppActorExperimentAssignment.fromJson(response);
  }

  async getRemoteConfig(key: string): Promise<AppActorRemoteConfigItem | null> {
    const response = await execute(METHOD_NAMES.getRemoteConfig, { key });
    if (response.value == null && !('key' in response)) {
      return null;
    }
    return AppActorRemoteConfigItem.fromJson(response);
  }

  async getRemoteConfigBool(key: string): Promise<boolean | null> {
    return (await this.getRemoteConfig(key))?.boolValue ?? null;
  }

  async getRemoteConfigString(key: string): Promise<string | null> {
    return (await this.getRemoteConfig(key))?.stringValue ?? null;
  }

  async getRemoteConfigNumber(key: string): Promise<number | null> {
    return (await this.getRemoteConfig(key))?.numberValue ?? null;
  }

  async getRemoteConfigInt(key: string): Promise<number | null> {
    const value = (await this.getRemoteConfig(key))?.numberValue;
    if (value == null) {
      return null;
    }
    return Number.isInteger(value) ? value : null;
  }

  async presentOfferCodeRedeemSheet(): Promise<void> {
    if (Platform.OS !== 'ios') {
      throw new UnsupportedError('presentOfferCodeRedeemSheet is iOS only');
    }
    await execute(METHOD_NAMES.presentOfferCodeRedeemSheet);
  }

  async getAsaDiagnostics(): Promise<AppActorAsaDiagnostics | null> {
    if (Platform.OS !== 'ios') {
      throw new UnsupportedError('getAsaDiagnostics is iOS only');
    }
    const response = await execute(METHOD_NAMES.getAsaDiagnostics);
    if (response.value == null && !('attribution_completed' in response)) {
      return null;
    }
    return AppActorAsaDiagnostics.fromJson(response);
  }

  async getPendingAsaPurchaseEventCount(): Promise<number> {
    if (Platform.OS !== 'ios') {
      throw new UnsupportedError(
        'getPendingAsaPurchaseEventCount is iOS only'
      );
    }
    const response = await execute(METHOD_NAMES.getPendingAsaPurchaseEventCount);
    return optionalInteger(response.value, 'value') ?? 0;
  }

  async getAsaFirstInstallOnDevice(): Promise<boolean> {
    if (Platform.OS !== 'ios') {
      throw new UnsupportedError('getAsaFirstInstallOnDevice is iOS only');
    }
    const response = await execute(METHOD_NAMES.getAsaFirstInstallOnDevice);
    return asBoolean(response.value) === true;
  }

  async getAsaFirstInstallOnAccount(): Promise<boolean> {
    if (Platform.OS !== 'ios') {
      throw new UnsupportedError('getAsaFirstInstallOnAccount is iOS only');
    }
    const response = await execute(METHOD_NAMES.getAsaFirstInstallOnAccount);
    return asBoolean(response.value) === true;
  }

  async purchaseFromIntent(
    intent: AppActorPurchaseIntent
  ): Promise<AppActorPurchaseResult> {
    if (Platform.OS !== 'ios') {
      throw new UnsupportedError('purchaseFromIntent is iOS only');
    }
    const response = await execute(METHOD_NAMES.purchaseFromIntent, {
      intent_id: intent.intentId,
    });
    return AppActorPurchaseResult.fromJson(response);
  }
}

export default AppActor;
