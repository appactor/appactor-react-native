import Foundation
import React
import AppActorPlugin

@objc(AppactorReactNative)
final class AppactorReactNative: RCTEventEmitter {
    private var hasListeners = false

    private func runOnMainActor(_ block: @escaping @MainActor () -> Void) {
        Task { @MainActor in
            block()
        }
    }

    override init() {
        super.init()
        AppActorPlugin.shared.delegate = self
        runOnMainActor {
            AppActorPlugin.shared.startEventListening()
        }
    }

    deinit {
        AppActorPlugin.shared.delegate = nil
        runOnMainActor {
            AppActorPlugin.shared.stopEventListening()
        }
    }

    override static func requiresMainQueueSetup() -> Bool {
        true
    }

    override func supportedEvents() -> [String]! {
        ["appactor_event"]
    }

    override func startObserving() {
        hasListeners = true
        runOnMainActor {
            AppActorPlugin.shared.startEventListening()
        }
    }

    override func stopObserving() {
        hasListeners = false
    }

    @objc(execute:payload:resolve:reject:)
    func execute(
        _ method: String,
        payload: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        AppActorPlugin.shared.execute(method: method, withJsonString: payload) { response in
            resolve(response)
        }
    }
}

extension AppactorReactNative: AppActorPluginDelegate {
    func appActorPlugin(
        _ plugin: AppActorPlugin,
        didReceiveEvent eventName: String,
        withJson jsonString: String
    ) {
        runOnMainActor { [weak self] in
            guard let self, self.hasListeners else { return }
            self.sendEvent(
                withName: "appactor_event",
                body: [
                    "name": eventName,
                    "json": jsonString,
                ]
            )
        }
    }
}
