import { beforeEach, describe, expect, it, jest } from '@jest/globals';

type ExecuteFn = (
  method: string,
  payload: string
) => Promise<string | null>;

var mockExecute: jest.MockedFunction<ExecuteFn>;
var mockNativeEventListeners: Array<
  (event: { name?: string; json?: string }) => void
> = [];

jest.mock('react-native', () => {
  mockExecute = jest.fn<ExecuteFn>();
  mockNativeEventListeners = [];

  return {
    NativeModules: {
      AppactorReactNative: {
        execute: mockExecute,
      },
    },
    NativeEventEmitter: jest.fn().mockImplementation(() => ({
      addListener: (
        _eventName: string,
        callback: (event: { name?: string; json?: string }) => void
      ) => {
        mockNativeEventListeners.push(callback);
        return { remove: jest.fn() };
      },
    })),
    Platform: {
      OS: 'ios',
      select: ({ ios, android }: { ios?: string; android?: string }) =>
        ios ?? android,
    },
  };
});

import {
  AppActor,
  AppActorAttributeValue,
  AppActorConfigValueType,
  AppActorEntitlementInfo,
  AppActorExperimentAssignment,
  AppActorLogLevel,
  AppActorOptions,
  AppActorPackage,
  AppActorPackageType,
  AppActorPlatformKeys,
  AppActorProductType,
  AppActorPurchaseStatus,
  AppActorRemoteConfigItem,
  AppActorStoreCapability,
  AppActorStore,
  AppActorSubscriptionInfo,
} from '../index';
import { Platform } from 'react-native';

function success(value: unknown): string {
  return JSON.stringify({ success: value });
}

describe('AppActor React Native', () => {
  beforeEach(async () => {
    mockExecute.mockReset();
    mockNativeEventListeners.splice(0, mockNativeEventListeners.length);
    (Platform as { OS: string }).OS = 'ios';
    mockExecute.mockResolvedValue(success(null));
    await AppActor.instance.reset();
    mockExecute.mockReset();
  });

  it('configures with wrapper platform info and staged ASA on iOS', async () => {
    mockExecute.mockResolvedValue(success(null));

    AppActor.instance.enableSearchAdsTracking();
    await AppActor.instance.configure('pk_test_123', {
      options: new AppActorOptions(AppActorLogLevel.Debug),
    });

    expect(mockExecute).toHaveBeenNthCalledWith(
      1,
      'configure',
      JSON.stringify({
        api_key: 'pk_test_123',
        options: {
          log_level: 'debug',
          platform_info: { flavor: 'react-native', version: '0.1.0' },
        },
      })
    );
    expect(mockExecute).toHaveBeenNthCalledWith(
      2,
      'enable_apple_search_ads_tracking',
      JSON.stringify({
        auto_track_purchases: true,
        track_in_sandbox: false,
        debug_mode: false,
      })
    );
  });

  it('selects platform keys for Android and does not run ASA there', async () => {
    (Platform as { OS: string }).OS = 'android';
    mockExecute.mockResolvedValue(success(null));

    await AppActor.instance.configure(
      new AppActorPlatformKeys('pk_ios', 'pk_android')
    );

    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockExecute).toHaveBeenCalledWith(
      'configure',
      JSON.stringify({
        api_key: 'pk_android',
        options: {
          platform_info: { flavor: 'react-native', version: '0.1.0' },
        },
      })
    );
  });

  it('serializes purchasePackage with quantity and trimmed placement', async () => {
    mockExecute.mockResolvedValue(success({ status: 'success' }));

    const pkg = new AppActorPackage(
      'monthly',
      AppActorPackageType.Monthly,
      'com.app.monthly',
      undefined,
      AppActorProductType.Subscription,
      AppActorStore.AppStore,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined
    );

    const result = await AppActor.instance.purchasePackage(pkg, {
      quantity: 3,
      placement: '  onboarding_paywall  ',
    });

    expect(result.status).toBe(AppActorPurchaseStatus.Purchased);
    expect(mockExecute).toHaveBeenCalledWith(
      'purchase_package',
      JSON.stringify({
        package_id: 'monthly',
        quantity: 3,
        placement: 'onboarding_paywall',
      })
    );
  });

  it('normalizes custom attributes before native dispatch', async () => {
    mockExecute.mockResolvedValue(success(null));

    await AppActor.instance.setAttributes({
      plan: AppActorAttributeValue.string('pro'),
      flags: AppActorAttributeValue.boolList([true, false]),
      last_seen: new Date('2026-05-16T12:00:00.000Z'),
    });

    expect(mockExecute).toHaveBeenCalledWith(
      'set_attributes',
      JSON.stringify({
        attributes: {
          plan: 'pro',
          flags: [true, false],
          last_seen: {
            value: '2026-05-16T12:00:00.000Z',
            valueType: 'date',
          },
        },
      })
    );
  });

  it('maps transport failures into AppActorError', async () => {
    mockExecute.mockRejectedValue(new Error('bridge exploded'));

    await expect(AppActor.instance.getCustomerInfo()).rejects.toMatchObject({
      code: 1004,
      message: 'bridge exploded',
    });
  });

  it('keeps iOS-only storefront helper behavior consistent with Flutter', async () => {
    const result = await AppActor.instance.getStorefront();
    expect(result).toBeNull();
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('dispatches receipt events from the native emitter', async () => {
    const listener = jest.fn();
    AppActor.instance.onReceiptPipelineEvent.listen(listener);

    mockNativeEventListeners[0]?.({
      name: 'receipt_pipeline_event',
      json: JSON.stringify({
        type: 'posted_ok',
        product_id: 'com.app.monthly',
        app_user_id: 'user_123',
      }),
    });

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'posted_ok',
        productId: 'com.app.monthly',
        appUserId: 'user_123',
      })
    );
  });

  it('exposes getRemoteConfigInt only for integral numbers', async () => {
    mockExecute
      .mockResolvedValueOnce(
        success({ key: 'whole', value: 5, value_type: 'number' })
      )
      .mockResolvedValueOnce(
        success({ key: 'fraction', value: 5.25, value_type: 'number' })
      );

    await expect(AppActor.instance.getRemoteConfigInt('whole')).resolves.toBe(5);
    await expect(
      AppActor.instance.getRemoteConfigInt('fraction')
    ).resolves.toBeNull();
  });

  it('treats sync, quiet sync, and drain queue as distinct wire methods', async () => {
    mockExecute.mockResolvedValue(
      success({ app_user_id: 'user_123', active_entitlement_keys: ['premium'] })
    );

    await AppActor.instance.syncPurchases();
    await AppActor.instance.quietSyncPurchases();
    await AppActor.instance.drainReceiptQueueAndRefreshCustomer();

    expect(
      mockExecute.mock.calls.map((call) => call[0])
    ).toEqual([
      'sync_purchases',
      'quiet_sync_purchases',
      'drain_receipt_queue_and_refresh_customer',
    ]);
  });

  it('parses structured native error envelopes into AppActorError', async () => {
    mockExecute.mockResolvedValue(
      JSON.stringify({
        error: {
          code: 2005,
          message: 'Network error',
          detail: 'transient=true',
        },
      })
    );

    await expect(AppActor.instance.getCustomerInfo()).rejects.toEqual(
      expect.objectContaining({
        code: 2005,
        message: 'Network error',
        isTransient: true,
      })
    );
  });

  it('accepts Flutter enum-name aliases in decoded payloads', async () => {
    const pkg = AppActorPackage.fromJson({
      id: 'monthly',
      package_type: 'twoMonth',
      product_id: 'com.app.monthly',
      product_type: 'nonConsumable',
      store: 'playStore',
    });
    const entitlement = AppActorEntitlementInfo.fromJson({
      identifier: 'premium',
      is_active: true,
      ownership_type: 'familyShared',
      period_type: 'twoMonth',
      subscription_status: 'gracePeriod',
      store: 'playStore',
      cancellation_reason: 'customerCancelled',
    });
    const subscription = AppActorSubscriptionInfo.fromJson({
      subscription_key: 'premium_monthly',
      product_identifier: 'com.app.monthly',
      store: 'playStore',
      period_type: 'sixMonth',
      cancellation_reason: 'developerCancelled',
    });

    (Platform as { OS: string }).OS = 'android';
    mockExecute.mockResolvedValue(
      success({ value: ['inAppProducts', 'purchaseHistory'] })
    );
    const capabilities = await AppActor.instance.getStoreCapabilities();

    expect(pkg.packageType).toBe(AppActorPackageType.TwoMonth);
    expect(pkg.productType).toBe(AppActorProductType.NonConsumable);
    expect(pkg.store).toBe(AppActorStore.PlayStore);
    expect(entitlement.ownershipType).toBe('family_shared');
    expect(entitlement.periodType).toBe('two_month');
    expect(entitlement.subscriptionStatus).toBe('grace_period');
    expect(entitlement.store).toBe(AppActorStore.PlayStore);
    expect(entitlement.cancellationReason).toBe('customer_cancelled');
    expect(subscription.store).toBe(AppActorStore.PlayStore);
    expect(subscription.periodType).toBe('six_month');
    expect(subscription.cancellationReason).toBe('developer_cancelled');
    expect(capabilities).toEqual(
      new Set([
        AppActorStoreCapability.InAppProducts,
        AppActorStoreCapability.PurchaseHistory,
      ])
    );
  });

  it('defaults missing value_type fields to string like Flutter', () => {
    const experiment = AppActorExperimentAssignment.fromJson({
      experiment_id: 'exp_123',
      experiment_key: 'pricing_test',
      variant_id: 'var_b',
      variant_key: 'B',
      payload: 'hero_copy',
    });
    const remoteConfig = AppActorRemoteConfigItem.fromJson({
      key: 'headline',
      value: 'hello',
    });

    expect(experiment.valueType).toBe(AppActorConfigValueType.String);
    expect(remoteConfig.valueType).toBe(AppActorConfigValueType.String);
  });

  it('matches Flutter validation for custom integration identifier types', async () => {
    await expect(
      AppActor.instance.setCustomIntegrationIdentifier('appactor.foo', 'abc')
    ).rejects.toThrow(
      'Integration identifier type cannot start with "appactor.".'
    );

    await expect(
      AppActor.instance.setCustomIntegrationIdentifier('x'.repeat(65), 'abc')
    ).rejects.toThrow(
      'Integration identifier type can contain at most 64 characters.'
    );
  });
});
