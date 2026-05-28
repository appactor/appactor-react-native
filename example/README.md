# AppActor React Native Example

This app exercises the React Native AppActor wrapper against the real native iOS and Android bridges.

## Prerequisites

- Node `22.11+`
- Yarn `4+`
- Xcode `16.1+`
- CocoaPods with an up-to-date specs repo
- Android Studio plus a JDK installation for Android builds

## Setup

From the repository root:

```sh
yarn install
```

Set your public API key in [`example/src/App.tsx`](src/App.tsx):

```ts
const EXAMPLE_API_KEY = 'pk_YOUR_PUBLIC_API_KEY';
```

## Run iOS

The first install should refresh CocoaPods specs so `AppActorPlugin 0.1.8` resolves correctly:

```sh
cd example/ios
pod install --repo-update
cd ..
yarn ios
```

## Run Android

Make sure a JDK is installed and available on `PATH`, then run:

```sh
cd example
yarn android
```

## What This Example Covers

- configure and reset
- log in and log out
- customer info refresh
- offerings fetch
- restore purchases
- sync purchases
- deprecated quiet sync alias
- drain receipt queue and refresh customer
- remote configs and experiment assignment
- ASA diagnostics on iOS
- storefront query
- purchase event logging
- purchase buttons for the current offering packages
