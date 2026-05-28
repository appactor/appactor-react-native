# Customer Attributes And Profile Context

The React Native SDK mirrors the current Flutter and native AppActor attribute surface, but different kinds of data are routed to different backend paths.

## Developer Custom Attributes

Use `setAttribute()`, `setAttributes()`, and `unsetAttribute()` for app-defined custom fields:

```ts
import { AppActor, AppActorAttributeValue } from 'appactor-react-native';

await AppActor.instance.setAttributes({
  plan: 'pro',
  trial: true,
  last_seen: new Date(),
  flags: AppActorAttributeValue.boolList([true, false]),
});

await AppActor.instance.unsetAttribute('legacy_plan');
```

Custom keys must be plain developer keys:

- no empty keys
- max length `64`
- allowed characters: `A-Z`, `a-z`, `0-9`, `_`, `.`, `:`, `-`
- no `$` prefix
- no `appactor.` prefix
- no `integration.` prefix
- no legacy reserved aliases like `appVersion`, `platform`, or `userCountry`

Supported custom values:

- string
- finite number
- boolean
- flat string arrays
- flat number arrays
- flat boolean arrays
- `Date`

Dates are encoded as:

```json
{ "value": "2026-05-16T12:00:00.000Z", "valueType": "date" }
```

`null` is rejected for custom writes so deletes stay explicit through `unsetAttribute(key)`.

## Reserved Profile Helpers

Use reserved profile helpers for AppActor-owned profile fields:

```ts
await AppActor.instance.setEmail('user@example.com');
await AppActor.instance.setDisplayName('Ada Lovelace');
await AppActor.instance.setPhoneNumber('+15551234567');
await AppActor.instance.setPushToken('push-token');
```

Passing `null` to nullable helpers clears that reserved field.

During `configure()`, the native SDK automatically sends privacy-safe profile context such as:

- platform
- app version
- SDK version
- OS version
- device model
- bundle or package identifier
- locale
- timezone

`collectDeviceIdentifiers()` remains the explicit opt-in path for additional device identifiers.

## Integration Identifiers

Use integration identifier methods for external user or device IDs:

```ts
import { AppActor, AppActorIntegrationIdentifier } from 'appactor-react-native';

await AppActor.instance.setAdjustID('adjust-user-123');
await AppActor.instance.setIntegrationIdentifier(
  AppActorIntegrationIdentifier.FirebaseAppInstanceId,
  'firebase-instance-id'
);
await AppActor.instance.setCustomIntegrationIdentifier(
  'kochava_device_id',
  'device-123'
);
```

These values do not go through the custom-attribute backend path.

## Attribution

Use attribution methods for campaign context:

```ts
import {
  AppActor,
  AppActorAttribution,
  AppActorAttributionProvider,
  AppActorAttributionStatus,
} from 'appactor-react-native';

await AppActor.instance.updateAttribution(
  new AppActorAttribution({
    provider: AppActorAttributionProvider.Adjust,
    status: AppActorAttributionStatus.NonOrganic,
    campaignName: 'spring_sale',
  })
);

await AppActor.instance.setMediaSource('facebook');
await AppActor.instance.setCampaign('spring_sale');
await AppActor.instance.setCampaign(null);
```

Important behavior:

- `updateAttribution()` is an omit-null partial update API.
- Direct `updateAttribution()` is not the same thing as explicit clear.
- Convenience helpers like `setCampaign(null)` are the explicit clear path for helper-managed fields.
