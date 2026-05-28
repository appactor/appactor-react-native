package com.appactor.reactnative

import com.appactor.plugin.AppActorPlugin
import com.appactor.plugin.events.PluginEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.modules.core.DeviceEventManagerModule

class AppactorReactNativeModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext), LifecycleEventListener {
  private var invalidated = false

  init {
    reactApplicationContext.addLifecycleEventListener(this)
    AppActorPlugin.setContext(reactApplicationContext)
    AppActorPlugin.eventListener = PluginEventListener { eventName, jsonPayload ->
      emitEvent(eventName, jsonPayload)
    }
    syncCurrentActivity()
    AppActorPlugin.startEventListening()
  }

  override fun getName(): String = "AppactorReactNative"

  @ReactMethod
  fun execute(method: String, payload: String, promise: Promise) {
    syncCurrentActivity()
    AppActorPlugin.execute(method, payload) { response ->
      UiThreadUtil.runOnUiThread {
        promise.resolve(response)
      }
    }
  }

  override fun onHostResume() {
    syncCurrentActivity()
    AppActorPlugin.startEventListening()
  }

  override fun onHostPause() {
    AppActorPlugin.setActivity(null)
  }

  override fun onHostDestroy() {
    AppActorPlugin.setActivity(null)
  }

  override fun invalidate() {
    invalidated = true
    reactApplicationContext.removeLifecycleEventListener(this)
    AppActorPlugin.eventListener = null
    AppActorPlugin.stopEventListening()
    AppActorPlugin.setActivity(null)
    super.invalidate()
  }

  @ReactMethod
  fun addListener(eventName: String) {
    // NativeEventEmitter requires these hooks on the backing module even when
    // the actual event routing is handled through the shared device emitter.
  }

  @ReactMethod
  fun removeListeners(count: Double) {
    // Intentionally a no-op: AppActorPlugin manages its own native listeners.
  }

  private fun syncCurrentActivity() {
    AppActorPlugin.setActivity(reactApplicationContext.currentActivity)
  }

  private fun emitEvent(eventName: String, jsonPayload: String) {
    UiThreadUtil.runOnUiThread {
      if (invalidated || !reactApplicationContext.hasActiveReactInstance()) {
        return@runOnUiThread
      }

      val payload = Arguments.createMap().apply {
        putString("name", eventName)
        putString("json", jsonPayload)
      }

      reactApplicationContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit("appactor_event", payload)
    }
  }
}
