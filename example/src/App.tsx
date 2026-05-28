import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  AppActor,
  AppActorAttribution,
  AppActorAttributionProvider,
  AppActorPurchaseIntent,
  AppActorLogLevel,
  AppActorOptions,
  AppActorPackage,
  AppActorPurchaseResult,
  AppActorRemoteConfigs,
  AppActorStorefront,
  AppActorExperimentAssignment,
  AppActorAsaDiagnostics,
  AppActorCustomerInfo,
  AppActorOfferings,
} from 'appactor-react-native';

const EXAMPLE_API_KEY = 'pk_YOUR_PUBLIC_API_KEY';

function hasConfiguredExampleKey(): boolean {
  return EXAMPLE_API_KEY !== 'pk_YOUR_PUBLIC_API_KEY';
}

function formatJson(value: unknown): string {
  return JSON.stringify(
    value,
    (_, item) => (item instanceof Set ? [...item] : item),
    2
  );
}

export default function App() {
  const didBootstrap = useRef(false);
  const [sdkVersion, setSdkVersion] = useState<string>('not configured');
  const [appUserId, setAppUserId] = useState<string | null>(null);
  const [isAnonymous, setIsAnonymous] = useState<boolean | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [customerInfo, setCustomerInfo] = useState<AppActorCustomerInfo | null>(
    null
  );
  const [offerings, setOfferings] = useState<AppActorOfferings | null>(null);
  const [remoteConfigs, setRemoteConfigs] =
    useState<AppActorRemoteConfigs | null>(null);
  const [experiment, setExperiment] =
    useState<AppActorExperimentAssignment | null>(null);
  const [storefront, setStorefront] = useState<AppActorStorefront | null>(null);
  const [asaDiagnostics, setAsaDiagnostics] =
    useState<AppActorAsaDiagnostics | null>(null);
  const [pendingPurchaseIntent, setPendingPurchaseIntent] =
    useState<AppActorPurchaseIntent | null>(null);
  const [pendingAsaPurchaseEventCount, setPendingAsaPurchaseEventCount] =
    useState<number | null>(null);
  const [asaFirstInstallOnDevice, setAsaFirstInstallOnDevice] =
    useState<boolean | null>(null);
  const [asaFirstInstallOnAccount, setAsaFirstInstallOnAccount] =
    useState<boolean | null>(null);
  const [offlineKeys, setOfflineKeys] = useState<string[]>([]);
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    const customerSub = AppActor.instance.onCustomerInfoUpdated.listen((info) => {
      setCustomerInfo(info);
      addLog(`customer_info_updated: ${[...info.activeEntitlementKeys].join(', ')}`);
    });
    const receiptSub = AppActor.instance.onReceiptPipelineEvent.listen((event) => {
      addLog(`receipt_pipeline_event: ${event.type} (${event.productId})`);
    });
    const deferredSub =
      AppActor.instance.onDeferredPurchaseResolved.listen((event) => {
        addLog(`deferred_purchase_resolved: ${event.productId}`);
      });
    const purchaseIntentSub = AppActor.instance.onPurchaseIntent.listen(
      (intent) => {
        setPendingPurchaseIntent(intent);
        addLog(`purchase_intent_received: ${intent.productId}`);
      }
    );

    if (!didBootstrap.current) {
      didBootstrap.current = true;
      if (hasConfiguredExampleKey()) {
        void safely('Configure', configure);
      } else {
        addLog('Set EXAMPLE_API_KEY, then tap Configure.');
      }
    }

    return () => {
      customerSub.remove();
      receiptSub.remove();
      deferredSub.remove();
      purchaseIntentSub.remove();
    };
  }, []);

  function addLog(message: string): void {
    setLogs((current) => [message, ...current].slice(0, 20));
  }

  async function safely(label: string, action: () => Promise<void>) {
    setLoading(true);
    setErrorMessage(null);
    try {
      await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorMessage(message);
      addLog(`${label}: ${message}`);
      Alert.alert(label, message);
    } finally {
      setLoading(false);
    }
  }

  async function configure(): Promise<void> {
    if (!hasConfiguredExampleKey()) {
      throw new Error('Set EXAMPLE_API_KEY before configuring the SDK.');
    }
    AppActor.instance.enableSearchAdsTracking();
    await AppActor.instance.configure(EXAMPLE_API_KEY, {
      options: new AppActorOptions(AppActorLogLevel.Debug),
    });
    await AppActor.instance.enableInstallReferrer();
    const version = await AppActor.instance.sdkVersion();
    setSdkVersion(version);
    setReady(true);
    await refreshAll();
    addLog(`SDK ready after bootstrap: ${version}`);
  }

  async function refreshAll(): Promise<void> {
    const [
      info,
      nextOfferings,
      nextRemoteConfigs,
      nextExperiment,
      keys,
      nextStorefront,
      nextAppUserId,
      nextIsAnonymous,
    ] = await Promise.all([
      AppActor.instance.getCustomerInfo(),
      AppActor.instance.getOfferings(),
      AppActor.instance.getRemoteConfigs(),
      AppActor.instance.getExperimentAssignment('pricing_test'),
      AppActor.instance.activeEntitlementKeysOffline(),
      AppActor.instance.getStorefront(),
      AppActor.instance.getAppUserId(),
      AppActor.instance.getIsAnonymous(),
    ]);

    setCustomerInfo(info);
    setOfferings(nextOfferings);
    setRemoteConfigs(nextRemoteConfigs);
    setExperiment(nextExperiment);
    setOfflineKeys([...keys]);
    setStorefront(nextStorefront);
    setAppUserId(nextAppUserId);
    setIsAnonymous(nextIsAnonymous);

    if (Platform.OS === 'ios') {
      const [asa, pendingCount, firstDevice, firstAccount] = await Promise.all([
        AppActor.instance.getAsaDiagnostics(),
        AppActor.instance.getPendingAsaPurchaseEventCount(),
        AppActor.instance.getAsaFirstInstallOnDevice(),
        AppActor.instance.getAsaFirstInstallOnAccount(),
      ]);
      setAsaDiagnostics(asa);
      setPendingAsaPurchaseEventCount(pendingCount);
      setAsaFirstInstallOnDevice(firstDevice);
      setAsaFirstInstallOnAccount(firstAccount);
    }

    addLog(
      `snapshot refreshed: ${Object.keys(nextOfferings.all).length} offerings, ${nextRemoteConfigs.items.length} configs`
    );
  }

  async function refreshCustomer(): Promise<void> {
    const info = await AppActor.instance.getCustomerInfo();
    setCustomerInfo(info);
    addLog(`customer loaded: ${info.appUserId ?? 'anonymous'}`);
  }

  async function fetchOfferings(): Promise<void> {
    const next = await AppActor.instance.getOfferings();
    setOfferings(next);
    addLog(`offerings loaded: ${Object.keys(next.all).length}`);
  }

  async function restorePurchases(): Promise<void> {
    const info = await AppActor.instance.restorePurchases({
      syncWithAppStore: Platform.OS === 'ios' ? true : undefined,
    });
    setCustomerInfo(info);
    addLog('restorePurchases completed');
  }

  async function syncPurchases(): Promise<void> {
    const info = await AppActor.instance.syncPurchases();
    setCustomerInfo(info);
    addLog('syncPurchases completed');
  }

  async function quietSyncPurchases(): Promise<void> {
    const info = await AppActor.instance.quietSyncPurchases();
    setCustomerInfo(info);
    addLog('quietSyncPurchases completed');
  }

  async function drainQueue(): Promise<void> {
    const info = await AppActor.instance.drainReceiptQueueAndRefreshCustomer();
    setCustomerInfo(info);
    addLog('drainReceiptQueueAndRefreshCustomer completed');
  }

  async function login(): Promise<void> {
    const info = await AppActor.instance.logIn('react_native_demo_user');
    setCustomerInfo(info);
    setAppUserId(info.appUserId ?? null);
    setIsAnonymous(false);
    addLog('logIn completed');
  }

  async function logout(): Promise<void> {
    const anonymous = await AppActor.instance.logOut();
    setCustomerInfo(null);
    setAppUserId(null);
    setIsAnonymous(anonymous);
    addLog('logOut completed');
  }

  async function refreshIdentity(): Promise<void> {
    const [nextAppUserId, nextIsAnonymous] = await Promise.all([
      AppActor.instance.getAppUserId(),
      AppActor.instance.getIsAnonymous(),
    ]);
    setAppUserId(nextAppUserId);
    setIsAnonymous(nextIsAnonymous);
    addLog(
      `identity: ${nextAppUserId ?? 'anonymous'} (${nextIsAnonymous ? 'anonymous' : 'identified'})`
    );
  }

  async function sendAttribution(): Promise<void> {
    await AppActor.instance.updateAttribution(
      new AppActorAttribution({
        provider: AppActorAttributionProvider.Custom,
        providerOverride: 'example_campaigns',
        campaign: 'spring_sale',
        source: 'react_native_example',
        metadata: {
          screen: 'example_home',
        },
      })
    );
    await AppActor.instance.setMediaSource('react_native_example');
    await AppActor.instance.setCampaign(null);
    addLog('attribution updated and campaign helper cleared');
  }

  async function fetchRemoteConfigs(): Promise<void> {
    const next = await AppActor.instance.getRemoteConfigs();
    setRemoteConfigs(next);
    addLog(`remote configs loaded: ${next.items.length}`);
  }

  async function fetchExperiment(): Promise<void> {
    const next = await AppActor.instance.getExperimentAssignment('pricing_test');
    setExperiment(next);
    addLog(next ? `experiment: ${next.variantKey}` : 'experiment: none');
  }

  async function fetchOfflineKeys(): Promise<void> {
    const keys = [...(await AppActor.instance.activeEntitlementKeysOffline())];
    setOfflineKeys(keys);
    addLog(`offline keys: ${keys.join(', ') || 'none'}`);
  }

  async function fetchStorefront(): Promise<void> {
    const next = await AppActor.instance.getStorefront();
    setStorefront(next);
    addLog(next ? `storefront: ${next.store}` : 'storefront: none');
  }

  async function fetchAsa(): Promise<void> {
    if (Platform.OS !== 'ios') {
      Alert.alert('iOS only', 'ASA diagnostics are available only on iOS.');
      return;
    }
    const next = await AppActor.instance.getAsaDiagnostics();
    setAsaDiagnostics(next);
    addLog(next ? 'ASA diagnostics loaded' : 'ASA diagnostics empty');
  }

  async function fetchPendingAsaEvents(): Promise<void> {
    if (Platform.OS !== 'ios') {
      Alert.alert('iOS only', 'Pending ASA events are available only on iOS.');
      return;
    }
    const next = await AppActor.instance.getPendingAsaPurchaseEventCount();
    setPendingAsaPurchaseEventCount(next);
    addLog(`pending ASA purchase events: ${next}`);
  }

  async function fetchAsaFirstInstallOnDevice(): Promise<void> {
    if (Platform.OS !== 'ios') {
      Alert.alert('iOS only', 'ASA first-install helpers are available only on iOS.');
      return;
    }
    const next = await AppActor.instance.getAsaFirstInstallOnDevice();
    setAsaFirstInstallOnDevice(next);
    addLog(`ASA first install on device: ${next}`);
  }

  async function fetchAsaFirstInstallOnAccount(): Promise<void> {
    if (Platform.OS !== 'ios') {
      Alert.alert('iOS only', 'ASA first-install helpers are available only on iOS.');
      return;
    }
    const next = await AppActor.instance.getAsaFirstInstallOnAccount();
    setAsaFirstInstallOnAccount(next);
    addLog(`ASA first install on account: ${next}`);
  }

  async function redeemOfferCode(): Promise<void> {
    if (Platform.OS !== 'ios') {
      Alert.alert('iOS only', 'Offer-code redemption is available only on iOS.');
      return;
    }
    await AppActor.instance.presentOfferCodeRedeemSheet();
    addLog('presentOfferCodeRedeemSheet completed');
  }

  async function purchasePendingIntent(): Promise<void> {
    if (Platform.OS !== 'ios') {
      Alert.alert('iOS only', 'Promoted purchase intents are available only on iOS.');
      return;
    }
    if (!pendingPurchaseIntent) {
      Alert.alert('No pending intent', 'Wait for a purchase-intent event first.');
      return;
    }
    const result = await AppActor.instance.purchaseFromIntent(
      pendingPurchaseIntent
    );
    if (result.customerInfo) {
      setCustomerInfo(result.customerInfo);
    }
    addLog(`purchaseFromIntent result: ${result.status}`);
  }

  async function purchase(pkg: AppActorPackage): Promise<void> {
    const result: AppActorPurchaseResult = await AppActor.instance.purchasePackage(
      pkg,
      { placement: 'example_paywall' }
    );
    if (result.customerInfo) {
      setCustomerInfo(result.customerInfo);
    }
    addLog(`purchase result: ${result.status}`);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>AppActor React Native Example</Text>
        <Text style={styles.subtitle}>
          Configure once, refresh the full SDK snapshot, and exercise the same
          purchase, config, attribution, identity, and diagnostics flows as the
          native SDKs.
        </Text>

        <Section title="SDK Snapshot">
          <Value label="Ready" value={ready} />
          <Value label="Loading" value={loading} />
          <Value label="SDK Version" value={sdkVersion} />
          <Value label="Last Error" value={errorMessage ?? 'none'} />
        </Section>

        <Section title="Lifecycle">
          <Action label="Configure" onPress={() => safely('Configure', configure)} />
          <Action label="Refresh All" onPress={() => safely('Refresh All', refreshAll)} />
          <Action
            label="Reset"
            onPress={() =>
              safely('Reset', async () => {
                await AppActor.instance.reset();
                setSdkVersion('reset');
                setAppUserId(null);
                setIsAnonymous(null);
                setReady(false);
                setErrorMessage(null);
                setCustomerInfo(null);
                setOfferings(null);
                setRemoteConfigs(null);
                setExperiment(null);
                setStorefront(null);
                setAsaDiagnostics(null);
                setPendingPurchaseIntent(null);
                setPendingAsaPurchaseEventCount(null);
                setAsaFirstInstallOnDevice(null);
                setAsaFirstInstallOnAccount(null);
                setOfflineKeys([]);
                addLog('reset completed');
              })
            }
          />
          <Action
            label="Set Debug Log Level"
            onPress={() =>
              safely('Set Log Level', () =>
                AppActor.instance.setLogLevel(AppActorLogLevel.Debug)
              )
            }
          />
          <Value label="SDK Version" value={sdkVersion} />
        </Section>

        <Section title="Identity">
          <Action label="Log In" onPress={() => safely('Log In', login)} />
          <Action label="Log Out" onPress={() => safely('Log Out', logout)} />
          <Action
            label="Refresh Identity"
            onPress={() => safely('Refresh Identity', refreshIdentity)}
          />
          <Action
            label="Refresh Customer"
            onPress={() => safely('Get Customer Info', refreshCustomer)}
          />
          <Value label="App User ID" value={appUserId ?? 'none'} />
          <Value label="Anonymous" value={isAnonymous ?? 'unknown'} />
        </Section>

        <Section title="Attribution">
          <Action
            label="Send Demo Attribution"
            onPress={() => safely('Attribution', sendAttribution)}
          />
          <Text style={styles.empty}>
            Sends a direct attribution snapshot, then demonstrates a nullable
            campaign helper clear.
          </Text>
        </Section>

        <Section title="Commerce">
          <Action
            label="Get Offerings"
            onPress={() => safely('Get Offerings', fetchOfferings)}
          />
          <Action
            label="Restore Purchases"
            onPress={() => safely('Restore Purchases', restorePurchases)}
          />
          <Action
            label="Sync Purchases"
            onPress={() => safely('Sync Purchases', syncPurchases)}
          />
          <Action
            label="Quiet Sync Purchases"
            onPress={() => safely('Quiet Sync', quietSyncPurchases)}
          />
          <Action
            label="Drain Queue + Refresh"
            onPress={() =>
              safely('Drain Queue + Refresh', drainQueue)
            }
          />
          {offerings?.current?.packages.map((pkg) => (
            <Action
              key={pkg.id}
              label={`Purchase ${pkg.id}`}
              onPress={() => safely(`Purchase ${pkg.id}`, () => purchase(pkg))}
            />
          ))}
        </Section>

        <Section title="Config And Diagnostics">
          <Action
            label="Get Remote Configs"
            onPress={() => safely('Remote Configs', fetchRemoteConfigs)}
          />
          <Action
            label="Get Experiment"
            onPress={() => safely('Experiment', fetchExperiment)}
          />
          <Action
            label="Offline Entitlement Keys"
            onPress={() => safely('Offline Keys', fetchOfflineKeys)}
          />
          <Action
            label="Storefront"
            onPress={() => safely('Storefront', fetchStorefront)}
          />
          <Action label="ASA Diagnostics" onPress={() => safely('ASA', fetchAsa)} />
          <Action
            label="Pending ASA Event Count"
            onPress={() => safely('Pending ASA Events', fetchPendingAsaEvents)}
          />
          <Action
            label="ASA First Install On Device"
            onPress={() =>
              safely('ASA First Install On Device', fetchAsaFirstInstallOnDevice)
            }
          />
          <Action
            label="ASA First Install On Account"
            onPress={() =>
              safely(
                'ASA First Install On Account',
                fetchAsaFirstInstallOnAccount
              )
            }
          />
          <Action
            label="Redeem Offer Code"
            onPress={() => safely('Redeem Offer Code', redeemOfferCode)}
          />
          <Action
            label="Purchase Pending Intent"
            onPress={() =>
              safely('Purchase Pending Intent', purchasePendingIntent)
            }
          />
        </Section>

        <Section title="State">
          <CustomerSummary info={customerInfo} />
          <OfferingsSummary offerings={offerings} />
          <ConfigSummary
            remoteConfigs={remoteConfigs}
            experiment={experiment}
            storefront={storefront}
            offlineKeys={offlineKeys}
          />
          <IosSummary
            asaDiagnostics={asaDiagnostics}
            pendingAsaPurchaseEventCount={pendingAsaPurchaseEventCount}
            asaFirstInstallOnDevice={asaFirstInstallOnDevice}
            asaFirstInstallOnAccount={asaFirstInstallOnAccount}
          />
          <JsonValue label="CustomerInfo Raw" value={customerInfo} />
          <JsonValue label="Offerings Raw" value={offerings} />
          <JsonValue label="RemoteConfigs Raw" value={remoteConfigs} />
          <JsonValue label="Pending Purchase Intent" value={pendingPurchaseIntent} />
        </Section>

        <Section title="Event Log">
          {logs.length === 0 ? (
            <Text style={styles.empty}>No events yet.</Text>
          ) : (
            logs.map((entry, index) => (
              <Text key={`${entry}-${index}`} style={styles.logLine}>
                {entry}
              </Text>
            ))
          )}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Action({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.action}>
      <Button title={label} onPress={onPress} />
    </View>
  );
}

function Value({
  label,
  value,
}: {
  label: string;
  value: boolean | number | string | null | undefined;
}) {
  return (
    <Text style={styles.value}>
      <Text style={styles.valueLabel}>{label}: </Text>
      {value == null ? 'none' : String(value)}
    </Text>
  );
}

function CustomerSummary({ info }: { info: AppActorCustomerInfo | null }) {
  if (!info) {
    return <Text style={styles.empty}>No customer snapshot loaded yet.</Text>;
  }

  const activeKeys = [...info.activeEntitlementKeys];
  const tokenTotal = info.tokenBalance?.total;

  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryTitle}>Customer</Text>
      <Value label="App User ID" value={info.appUserId ?? 'anonymous'} />
      <Value label="Computed Offline" value={info.isComputedOffline} />
      <Value label="Active Entitlements" value={activeKeys.join(', ') || 'none'} />
      <Value label="Entitlement Count" value={Object.keys(info.entitlements).length} />
      <Value label="Subscription Count" value={Object.keys(info.subscriptions).length} />
      <Value label="Token Balance" value={tokenTotal ?? 'none'} />
      <Value label="Verification" value={info.verification} />
    </View>
  );
}

function OfferingsSummary({
  offerings,
}: {
  offerings: AppActorOfferings | null;
}) {
  if (!offerings) {
    return <Text style={styles.empty}>No offerings loaded yet.</Text>;
  }

  const currentPackages = offerings.current?.packages ?? [];

  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryTitle}>Offerings</Text>
      <Value label="Current" value={offerings.current?.id ?? 'none'} />
      <Value label="All Offerings" value={Object.keys(offerings.all).join(', ') || 'none'} />
      <Value label="Verification" value={offerings.verification} />
      {currentPackages.length === 0 ? (
        <Text style={styles.empty}>Current offering has no packages.</Text>
      ) : (
        currentPackages.map((pkg) => (
          <Text key={pkg.id} style={styles.summaryLine}>
            {pkg.id}: {pkg.localizedPriceString ?? pkg.price ?? 'no price'} (
            {pkg.productId})
          </Text>
        ))
      )}
    </View>
  );
}

function ConfigSummary({
  remoteConfigs,
  experiment,
  storefront,
  offlineKeys,
}: {
  remoteConfigs: AppActorRemoteConfigs | null;
  experiment: AppActorExperimentAssignment | null;
  storefront: AppActorStorefront | null;
  offlineKeys: string[];
}) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryTitle}>Config And Store</Text>
      <Value label="Remote Config Count" value={remoteConfigs?.items.length ?? 0} />
      <Value label="Experiment" value={experiment?.experimentKey ?? 'none'} />
      <Value label="Variant" value={experiment?.variantKey ?? 'none'} />
      <Value label="Storefront" value={storefront?.store ?? 'none'} />
      <Value label="Offline Keys" value={offlineKeys.join(', ') || 'none'} />
    </View>
  );
}

function IosSummary({
  asaDiagnostics,
  pendingAsaPurchaseEventCount,
  asaFirstInstallOnDevice,
  asaFirstInstallOnAccount,
}: {
  asaDiagnostics: AppActorAsaDiagnostics | null;
  pendingAsaPurchaseEventCount: number | null;
  asaFirstInstallOnDevice: boolean | null;
  asaFirstInstallOnAccount: boolean | null;
}) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryTitle}>iOS Diagnostics</Text>
      <Value
        label="ASA Completed"
        value={asaDiagnostics?.attributionCompleted ?? 'none'}
      />
      <Value
        label="Pending ASA Events"
        value={pendingAsaPurchaseEventCount ?? 'none'}
      />
      <Value
        label="First Install On Device"
        value={asaFirstInstallOnDevice ?? 'none'}
      />
      <Value
        label="First Install On Account"
        value={asaFirstInstallOnAccount ?? 'none'}
      />
    </View>
  );
}

function JsonValue({ label, value }: { label: string; value: unknown }) {
  return (
    <View style={styles.jsonBlock}>
      <Text style={styles.valueLabel}>{label}</Text>
      <Text style={styles.jsonText}>
        {value == null ? 'null' : formatJson(value)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F4F8FB',
  },
  container: {
    padding: 20,
    gap: 18,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#163A5F',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: '#31546F',
  },
  section: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D9E6F2',
  },
  sectionTitle: {
    marginBottom: 12,
    fontSize: 18,
    fontWeight: '700',
    color: '#1A4E75',
  },
  action: {
    marginBottom: 10,
  },
  value: {
    marginTop: 4,
    fontSize: 14,
    color: '#20445F',
  },
  valueLabel: {
    fontWeight: '700',
    color: '#163A5F',
  },
  summaryCard: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#F7FBFE',
    borderWidth: 1,
    borderColor: '#D9E6F2',
  },
  summaryTitle: {
    marginBottom: 6,
    fontSize: 15,
    fontWeight: '700',
    color: '#1A4E75',
  },
  summaryLine: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    color: '#20445F',
  },
  jsonBlock: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#EEF5FB',
  },
  jsonText: {
    marginTop: 8,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    fontSize: 12,
    lineHeight: 18,
    color: '#17354C',
  },
  empty: {
    color: '#597087',
  },
  logLine: {
    marginBottom: 6,
    color: '#17354C',
  },
});
