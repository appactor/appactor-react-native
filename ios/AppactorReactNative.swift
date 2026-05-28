import Foundation
import React
import AppActorPlugin

@objc(AppactorReactNative)
final class AppactorReactNative: RCTEventEmitter {
    private var hasListeners = false

    override init() {
        super.init()
        AppActorPlugin.shared.delegate = self
        Task { @MainActor in
            AppActorPlugin.shared.startEventListening()
        }
    }

    deinit {
        AppActorPlugin.shared.delegate = nil
        Task { @MainActor in
            AppActorPlugin.shared.stopEventListening()
        }
    }

    override static func requiresMainQueueSetup() -> Bool {
        false
    }

    override func supportedEvents() -> [String]! {
        ["appactor_event"]
    }

    override func startObserving() {
        hasListeners = true
        Task { @MainActor in
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
        guard hasListeners else { return }
        sendEvent(
            withName: "appactor_event",
            body: [
                "name": eventName,
                "json": jsonString,
            ]
        )
    }
}
