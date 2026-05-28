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
  AppActorAsaDiagnostics,
  AppActorAsaOptions,
  AppActorAttributeValue,
  AppActorAttribution,
  AppActorAttributionProvider,
  AppActorCustomerInfo,
  AppActorDeferredPurchaseEvent,
  AppActorError,
  AppActorConfigValueType,
  AppActorEntitlementInfo,
  AppActorExperimentAssignment,
  AppActorIntegrationIdentifier,
  AppActorLogLevel,
  AppActorOptions,
  AppActorOfferings,
  AppActorPackage,
  AppActorPackageType,
  AppActorPlatformKeys,
  AppActorPurchaseIntent,
  AppActorPurchaseResult,
  AppActorProductType,
  AppActorPurchaseStatus,
  AppActorRemoteConfigItem,
  AppActorRemoteConfigs,
  AppActorStoreCapability,
  AppActorStore,
  AppActorStorefront,
  AppActorSubscriptionInfo,
  AppActorVerificationResult,
  UnsupportedError,
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

  it('accepts direct ASA options before configure, like Flutter', async () => {
    mockExecute.mockResolvedValue(success(null));

    AppActor.instance.enableSearchAdsTracking(
      new AppActorAsaOptions(false, true, true)
    );
    await AppActor.instance.configure('pk_test_123');

    expect(mockExecute).toHaveBeenNthCalledWith(
      2,
      'enable_apple_search_ads_tracking',
      JSON.stringify({
        auto_track_purchases: false,
        track_in_sandbox: true,
        debug_mode: true,
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

  it('rejects platform keys on unsupported platforms with UnsupportedError', async () => {
    (Platform as { OS: string }).OS = 'windows';

    await expect(
      AppActor.instance.configure(
        new AppActorPlatformKeys('pk_ios', 'pk_android')
      )
    ).rejects.toBeInstanceOf(UnsupportedError);
  });

  it('forwards empty-string appUserId like Flutter', async () => {
    mockExecute.mockResolvedValue(success(null));

    await AppActor.instance.configure('pk_test_123', {
      appUserId: '',
    });

    expect(mockExecute).toHaveBeenCalledWith(
      'configure',
      JSON.stringify({
        api_key: 'pk_test_123',
        app_user_id: '',
        options: {
          platform_info: { flavor: 'react-native', version: '0.1.0' },
        },
      })
    );
  });

  it('keeps customer info events flowing after reset and reconfigure', async () => {
    mockExecute.mockResolvedValue(success(null));

    const listener = jest.fn();
    AppActor.instance.onCustomerInfoUpdated.listen(listener);

    await AppActor.instance.configure('pk_test_123');
    await AppActor.instance.reset();
    await AppActor.instance.configure('pk_test_123');

    for (const nativeListener of mockNativeEventListeners) {
      nativeListener({
        name: 'customer_info_updated',
        json: JSON.stringify({
          app_user_id: 'user_reset_123',
        }),
      });
    }

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        appUserId: 'user_reset_123',
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

  it('serializes restorePurchases with syncWithAppStore when provided', async () => {
    mockExecute.mockResolvedValue(
      success({ app_user_id: 'user_restore_123' })
    );

    const result = await AppActor.instance.restorePurchases({
      syncWithAppStore: true,
    });

    expect(result.appUserId).toBe('user_restore_123');
    expect(mockExecute).toHaveBeenCalledWith(
      'restore_purchases',
      JSON.stringify({
        sync_with_app_store: true,
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

  it('accepts iterable attribute entries like Map', async () => {
    mockExecute.mockResolvedValue(success(null));

    await AppActor.instance.setAttributes(
      new Map<string, unknown>([
        ['plan', 'pro'],
        ['trial', true],
        ['last_seen', new Date('2026-05-16T12:00:00.000Z')],
      ])
    );

    expect(mockExecute).toHaveBeenCalledWith(
      'set_attributes',
      JSON.stringify({
        attributes: {
          plan: 'pro',
          trial: true,
          last_seen: {
            value: '2026-05-16T12:00:00.000Z',
            valueType: 'date',
          },
        },
      })
    );
  });

  it('accepts primitive iterable attribute values like Set', async () => {
    mockExecute.mockResolvedValue(success(null));

    await AppActor.instance.setAttributes({
      eligible_products: new Set(['monthly', 'annual']),
    });

    expect(mockExecute).toHaveBeenCalledWith(
      'set_attributes',
      JSON.stringify({
        attributes: {
          eligible_products: ['monthly', 'annual'],
        },
      })
    );
  });

  it('accepts iterable attribution metadata entries like Map', () => {
    const attribution = new AppActorAttribution({
      provider: AppActorAttributionProvider.Adjust,
      metadata: new Map<string, unknown>([
        ['campaign_weight', 1.5],
        ['captured_at', new Date('2026-05-16T12:00:00.000Z')],
      ]),
    });

    expect(attribution.toJson()).toEqual({
      provider: 'adjust',
      metadata: {
        campaign_weight: 1.5,
        captured_at: {
          value: '2026-05-16T12:00:00.000Z',
          valueType: 'date',
        },
      },
    });
  });

  it('accepts primitive iterable attribution metadata values like Set', () => {
    const attribution = new AppActorAttribution({
      provider: AppActorAttributionProvider.Adjust,
      metadata: {
        platforms: new Set(['ios', 'android']),
      },
    });

    expect(attribution.toJson()).toEqual({
      provider: 'adjust',
      metadata: {
        platforms: ['ios', 'android'],
      },
    });
  });

  it('accepts Flutter-style attribution init objects', () => {
    const attribution = new AppActorAttribution({
      provider: AppActorAttributionProvider.AppleSearchAds,
      campaignName: 'spring_sale',
      adGroup: 'brand_search',
      attributedAt: new Date('2026-05-16T12:00:00.000Z'),
      metadata: {
        source: 'react-native',
      },
    });

    expect(attribution.toJson()).toEqual({
      provider: 'apple_search_ads',
      campaign_name: 'spring_sale',
      ad_group: 'brand_search',
      attributed_at: '2026-05-16T12:00:00.000Z',
      metadata: {
        source: 'react-native',
      },
    });
  });

  it('routes profile helpers through the native bridge', async () => {
    mockExecute.mockResolvedValue(success(null));

    await AppActor.instance.setEmail('user@example.com');
    await AppActor.instance.setDisplayName('Ada Lovelace');
    await AppActor.instance.setPhoneNumber('+15551234567');
    await AppActor.instance.setPushToken('push-token-123');
    await AppActor.instance.collectDeviceIdentifiers();

    expect(
      mockExecute.mock.calls.map((call) => call[0])
    ).toEqual([
      'set_email',
      'set_display_name',
      'set_phone_number',
      'set_push_token',
      'collect_device_identifiers',
    ]);
    expect(mockExecute).toHaveBeenNthCalledWith(
      1,
      'set_email',
      JSON.stringify({ email: 'user@example.com' })
    );
    expect(mockExecute).toHaveBeenNthCalledWith(
      2,
      'set_display_name',
      JSON.stringify({ display_name: 'Ada Lovelace' })
    );
    expect(mockExecute).toHaveBeenNthCalledWith(
      3,
      'set_phone_number',
      JSON.stringify({ phone_number: '+15551234567' })
    );
    expect(mockExecute).toHaveBeenNthCalledWith(
      4,
      'set_push_token',
      JSON.stringify({ push_token: 'push-token-123' })
    );
    expect(mockExecute).toHaveBeenNthCalledWith(
      5,
      'collect_device_identifiers',
      JSON.stringify({})
    );
  });

  it('rejects invalid profile helper values before native dispatch', async () => {
    await expect(AppActor.instance.setEmail('bad-email')).rejects.toThrow(
      'Email must be valid.'
    );
    await expect(AppActor.instance.setPhoneNumber('abc')).rejects.toThrow(
      'Phone number must be valid.'
    );
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('can clear integration identifiers through the native bridge', async () => {
    mockExecute.mockResolvedValue(success(null));

    await AppActor.instance.unsetIntegrationIdentifier(
      AppActorIntegrationIdentifier.AdjustId
    );
    await AppActor.instance.unsetCustomIntegrationIdentifier(
      'kochava_device_id'
    );

    expect(mockExecute).toHaveBeenNthCalledWith(
      1,
      'set_integration_identifier',
      JSON.stringify({
        type: 'adjust_adid',
        value: null,
      })
    );
    expect(mockExecute).toHaveBeenNthCalledWith(
      2,
      'set_integration_identifier',
      JSON.stringify({
        type: 'kochava_device_id',
        value: null,
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

  it('dispatches deferred purchase events from the native emitter', async () => {
    const listener = jest.fn();
    AppActor.instance.onDeferredPurchaseResolved.listen(listener);

    mockNativeEventListeners[0]?.({
      name: 'deferred_purchase_resolved',
      json: JSON.stringify({
        product_id: 'com.app.monthly',
        customer_info: {
          app_user_id: 'user_123',
        },
      }),
    });

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 'com.app.monthly',
        customerInfo: expect.objectContaining({
          appUserId: 'user_123',
        }),
      })
    );
  });

  it('drops malformed native events like Flutter', async () => {
    mockExecute.mockResolvedValue(success(null));

    const receiptListener = jest.fn();
    const logSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
    const invalidPayloads = ['{', '[]', 'null', '"oops"'];

    AppActor.instance.onReceiptPipelineEvent.listen(receiptListener);
    await AppActor.instance.configure('pk_test_123');

    for (const nativeListener of mockNativeEventListeners) {
      for (const invalidPayload of invalidPayloads) {
        nativeListener({
          name: 'receipt_pipeline_event',
          json: invalidPayload,
        });
        nativeListener({
          name: 'sdk_log',
          json: invalidPayload,
        });
      }
    }

    expect(receiptListener).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('ignores unknown native event names without crashing the bridge', () => {
    const receiptListener = jest.fn();
    const customerListener = jest.fn();

    AppActor.instance.onReceiptPipelineEvent.listen(receiptListener);
    AppActor.instance.onCustomerInfoUpdated.listen(customerListener);

    mockNativeEventListeners[0]?.({
      name: 'totally_unknown_event',
      json: JSON.stringify({
        foo: 'bar',
      }),
    });

    expect(receiptListener).not.toHaveBeenCalled();
    expect(customerListener).not.toHaveBeenCalled();
  });

  it('surfaces sdk_log events for diagnostics listeners', async () => {
    const listener = jest.fn();
    AppActor.instance.onSdkLog.listen(listener);

    mockNativeEventListeners[0]?.({
      name: 'sdk_log',
      json: JSON.stringify({
        level: 'debug',
        message: 'purchase sync finished',
        category: 'pipeline',
        timestamp: '2026-05-16T12:00:00.000Z',
      }),
    });

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'debug',
        message: 'purchase sync finished',
        category: 'pipeline',
        timestamp: new Date('2026-05-16T12:00:00.000Z'),
      })
    );
  });

  it('prints sdk_log events in debug mode even without a listener', async () => {
    mockExecute.mockResolvedValue(success(null));
    const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});

    await AppActor.instance.configure('pk_test_123');

    for (const nativeListener of mockNativeEventListeners) {
      nativeListener({
        name: 'sdk_log',
        json: JSON.stringify({
          level: 'debug',
          message: 'purchase sync finished',
          category: 'pipeline',
        }),
      });
    }

    expect(debugSpy).toHaveBeenCalledWith(
      '[AppActor/DEBUG] pipeline: purchase sync finished'
    );
    debugSpy.mockRestore();
  });

  it('reads iOS ASA helper values through the native bridge', async () => {
    mockExecute
      .mockResolvedValueOnce(success(3))
      .mockResolvedValueOnce(success(true))
      .mockResolvedValueOnce(success(false));

    await expect(
      AppActor.instance.getPendingAsaPurchaseEventCount()
    ).resolves.toBe(3);
    await expect(AppActor.instance.getAsaFirstInstallOnDevice()).resolves.toBe(
      true
    );
    await expect(AppActor.instance.getAsaFirstInstallOnAccount()).resolves.toBe(
      false
    );

    expect(
      mockExecute.mock.calls.map((call) => call[0])
    ).toEqual([
      'get_pending_asa_purchase_event_count',
      'get_asa_first_install_on_device',
      'get_asa_first_install_on_account',
    ]);
  });

  it('surfaces purchase-intent events and purchases them on iOS', async () => {
    mockExecute.mockResolvedValue(
      success({
        status: 'success',
        customer_info: {
          app_user_id: 'user_123',
        },
      })
    );

    const listener = jest.fn();
    AppActor.instance.onPurchaseIntent.listen(listener);

    mockNativeEventListeners[0]?.({
      name: 'purchase_intent_received',
      json: JSON.stringify({
        intent_id: 'intent_123',
        product_id: 'com.app.monthly',
        offer_id: 'offer_123',
        offer_type: 'intro7d',
      }),
    });

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        intentId: 'intent_123',
        productId: 'com.app.monthly',
        offerId: 'offer_123',
        offerType: 'intro7d',
      })
    );

    const result = await AppActor.instance.purchaseFromIntent(
      new AppActorPurchaseIntent(
        'intent_123',
        'com.app.monthly',
        'offer_123',
        'intro7d'
      )
    );

    expect(result.status).toBe(AppActorPurchaseStatus.Purchased);
    expect(result.customerInfo?.appUserId).toBe('user_123');
    expect(mockExecute).toHaveBeenCalledWith(
      'purchase_from_intent',
      JSON.stringify({
        intent_id: 'intent_123',
      })
    );
  });

  it('throws UnsupportedError for iOS-only helpers on Android', async () => {
    (Platform as { OS: string }).OS = 'android';

    await expect(
      AppActor.instance.presentOfferCodeRedeemSheet()
    ).rejects.toBeInstanceOf(UnsupportedError);
    await expect(
      AppActor.instance.purchaseFromIntent(
        new AppActorPurchaseIntent('intent_123', 'product_123')
      )
    ).rejects.toBeInstanceOf(UnsupportedError);
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

  it('parses enriched error fields', () => {
    const error = AppActorError.fromJson({
      code: 2007,
      message: 'Rate limited',
      detail: 'httpStatus=429, transient=true',
      request_id: 'req_abc123',
      scope: 'ip',
      retry_after_seconds: 30,
    });

    expect(error.requestId).toBe('req_abc123');
    expect(error.scope).toBe('ip');
    expect(error.retryAfterSeconds).toBe(30);
    expect(error.isTransient).toBe(true);
  });

  it('parses ASA diagnostics, storefront, remote configs, and deferred purchase models', () => {
    const diagnostics = AppActorAsaDiagnostics.fromJson({
      attribution_completed: true,
      pending_purchase_event_count: 2,
      debug_mode: true,
      auto_track_purchases: false,
      track_in_sandbox: true,
    });
    const storefront = AppActorStorefront.fromJson({
      store: 'playStore',
      country_code: 'TR',
    });
    const remoteConfigs = AppActorRemoteConfigs.fromJson({
      items: [
        {
          key: 'headline',
          value: 'hello',
          value_type: 'string',
        },
      ],
    });
    const deferred = AppActorDeferredPurchaseEvent.fromJson({
      product_id: 'com.app.monthly',
      customer_info: {
        app_user_id: 'user_123',
      },
    });

    expect(diagnostics).toEqual(
      expect.objectContaining({
        attributionCompleted: true,
        pendingPurchaseEventCount: 2,
        debugMode: true,
        autoTrackPurchases: false,
        trackInSandbox: true,
      })
    );
    expect(storefront).toEqual(
      expect.objectContaining({
        store: AppActorStore.PlayStore,
        countryCode: 'TR',
      })
    );
    expect(remoteConfigs.get('headline')?.stringValue).toBe('hello');
    expect(deferred).toEqual(
      expect.objectContaining({
        productId: 'com.app.monthly',
        customerInfo: expect.objectContaining({
          appUserId: 'user_123',
        }),
      })
    );
  });

  it('parses purchase result helper flags directly', () => {
    const purchaseResult = AppActorPurchaseResult.fromJson({
      status: 'restored',
      customer_info: {
        app_user_id: 'user_123',
      },
      purchase_info: {
        store: 'appStore',
        product_id: 'com.app.monthly',
        transaction_id: 'txn_123',
        original_transaction_id: 'orig_123',
        purchase_date: '2026-05-16T12:00:00.000Z',
        is_sandbox: true,
      },
    });

    expect(purchaseResult.status).toBe(AppActorPurchaseStatus.Restored);
    expect(purchaseResult.isRestored).toBe(true);
    expect(purchaseResult.isPurchased).toBe(false);
    expect(purchaseResult.customerInfo?.appUserId).toBe('user_123');
    expect(purchaseResult.purchaseInfo).toEqual(
      expect.objectContaining({
        store: AppActorStore.AppStore,
        productId: 'com.app.monthly',
        transactionId: 'txn_123',
        originalTransactionId: 'orig_123',
        purchaseDate: '2026-05-16T12:00:00.000Z',
        isSandbox: true,
      })
    );
  });

  it('parses richer experiment assignment payloads directly', () => {
    const experiment = AppActorExperimentAssignment.fromJson({
      experiment_id: 'exp_123',
      experiment_key: 'pricing_test',
      variant_id: 'var_b',
      variant_key: 'B',
      payload: {
        paywall: 'annual_first',
        price_anchor: 59.99,
      },
      value_type: 'json',
      assigned_at: '2026-05-16T12:00:00.000Z',
    });

    expect(experiment).toEqual(
      expect.objectContaining({
        experimentId: 'exp_123',
        experimentKey: 'pricing_test',
        variantId: 'var_b',
        variantKey: 'B',
        payload: {
          paywall: 'annual_first',
          price_anchor: 59.99,
        },
        valueType: AppActorConfigValueType.Json,
        assignedAt: '2026-05-16T12:00:00.000Z',
      })
    );
  });

  it('supports direct equality checks for purchase result and experiment assignment models', () => {
    const purchaseResultA = AppActorPurchaseResult.fromJson({
      status: 'success',
      customer_info: {
        app_user_id: 'user_123',
      },
      purchase_info: {
        store: 'appStore',
        product_id: 'com.app.monthly',
        transaction_id: 'txn_123',
      },
    });
    const purchaseResultB = AppActorPurchaseResult.fromJson({
      status: 'success',
      customer_info: {
        app_user_id: 'user_123',
      },
      purchase_info: {
        store: 'appStore',
        product_id: 'com.app.monthly',
        transaction_id: 'txn_123',
      },
    });
    const experimentA = AppActorExperimentAssignment.fromJson({
      experiment_id: 'exp_123',
      experiment_key: 'pricing_test',
      variant_id: 'var_b',
      variant_key: 'B',
      payload: {
        paywall: 'annual_first',
      },
      value_type: 'json',
      assigned_at: '2026-05-16T12:00:00.000Z',
    });
    const experimentB = AppActorExperimentAssignment.fromJson({
      experiment_id: 'exp_123',
      experiment_key: 'pricing_test',
      variant_id: 'var_b',
      variant_key: 'B',
      payload: {
        paywall: 'annual_first',
      },
      value_type: 'json',
      assigned_at: '2026-05-16T12:00:00.000Z',
    });

    expect(purchaseResultA).toEqual(purchaseResultB);
    expect(experimentA).toEqual(experimentB);
  });

  it('parses verification fields on customer info and offerings', () => {
    const customerInfo = AppActorCustomerInfo.fromJson({
      app_user_id: 'user_1',
      verification: 'verified',
    });
    const entitlement = AppActorEntitlementInfo.fromJson({
      identifier: 'premium',
      is_active: true,
      active_promotional_offer_type: 'intro7d',
      active_promotional_offer_id: 'offer_123',
    });
    const offerings = AppActorOfferings.fromJson({
      all: {},
      verification: 'verifiedOnDevice',
    });

    expect(customerInfo.verification).toBe(AppActorVerificationResult.Verified);
    expect(entitlement.activePromotionalOfferType).toBe('intro7d');
    expect(entitlement.activePromotionalOfferId).toBe('offer_123');
    expect(offerings.verification).toBe(
      AppActorVerificationResult.VerifiedOnDevice
    );
  });

  it('parses promotional offer fields on subscription info', () => {
    const info = AppActorSubscriptionInfo.fromJson({
      subscription_key: 'sub_1',
      product_identifier: 'com.app.monthly',
      is_active: true,
      active_promotional_offer_type: 'winBack',
      active_promotional_offer_id: 'offer_456',
    });

    expect(info.activePromotionalOfferType).toBe('winBack');
    expect(info.activePromotionalOfferId).toBe('offer_456');
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

  it('blocks direct AppActor instantiation outside the singleton', () => {
    const AppActorConstructor =
      AppActor as unknown as new (...args: unknown[]) => AppActor;

    expect(() => new AppActorConstructor()).toThrow(
      'AppActor cannot be instantiated directly. Use AppActor.instance.'
    );
  });
});
