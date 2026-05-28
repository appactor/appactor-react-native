import React, { useEffect, useState } from 'react';
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

function formatJson(value: unknown): string {
  return JSON.stringify(
    value,
    (_, item) => (item instanceof Set ? [...item] : item),
    2
  );
}

export default function App() {
  const [sdkVersion, setSdkVersion] = useState<string>('not configured');
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

    return () => {
      customerSub.remove();
      receiptSub.remove();
      deferredSub.remove();
    };
  }, []);

  function addLog(message: string): void {
    setLogs((current) => [message, ...current].slice(0, 20));
  }

  async function safely(label: string, action: () => Promise<void>) {
    try {
      await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`${label}: ${message}`);
      Alert.alert(label, message);
    }
  }

  async function configure(): Promise<void> {
    AppActor.instance.enableSearchAdsTracking();
    await AppActor.instance.configure(EXAMPLE_API_KEY, {
      options: new AppActorOptions(AppActorLogLevel.Debug),
    });
    await AppActor.instance.enableInstallReferrer();
    const version = await AppActor.instance.sdkVersion();
    setSdkVersion(version);
    addLog(`SDK ready after bootstrap: ${version}`);
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
    addLog('logIn completed');
  }

  async function logout(): Promise<void> {
    await AppActor.instance.logOut();
    addLog('logOut completed');
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
          Configure the SDK, fetch offerings/customer info, and exercise
          purchase-related flows.
        </Text>

        <Section title="Lifecycle">
          <Action label="Configure" onPress={() => safely('Configure', configure)} />
          <Action
            label="Reset"
            onPress={() =>
              safely('Reset', async () => {
                await AppActor.instance.reset();
                setSdkVersion('reset');
                setCustomerInfo(null);
                setOfferings(null);
                setRemoteConfigs(null);
                setExperiment(null);
                setStorefront(null);
                setAsaDiagnostics(null);
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
            label="Refresh Customer"
            onPress={() => safely('Get Customer Info', refreshCustomer)}
          />
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
        </Section>

        <Section title="State">
          <JsonValue label="CustomerInfo" value={customerInfo} />
          <JsonValue label="Offerings" value={offerings} />
          <JsonValue label="RemoteConfigs" value={remoteConfigs} />
          <JsonValue label="Experiment" value={experiment} />
          <JsonValue label="Storefront" value={storefront} />
          <JsonValue label="ASA Diagnostics" value={asaDiagnostics} />
          <JsonValue label="Offline Keys" value={offlineKeys} />
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

function Value({ label, value }: { label: string; value: string }) {
  return (
    <Text style={styles.value}>
      <Text style={styles.valueLabel}>{label}: </Text>
      {value}
    </Text>
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
