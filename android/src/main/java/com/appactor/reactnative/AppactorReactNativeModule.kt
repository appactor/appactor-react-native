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

  private val eventListener = PluginEventListener { eventName, jsonPayload ->
    emitEvent(eventName, jsonPayload)
  }

  init {
    reactApplicationContext.addLifecycleEventListener(this)
    AppActorPlugin.setContext(reactApplicationContext)
    AppActorPlugin.eventListener = eventListener
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
    // Re-assert this instance's listener. The slot is a process-global single
    // slot, so a sibling context tearing down could have nulled it; without
    // this, all SDK events would be silently dropped until app restart.
    AppActorPlugin.eventListener = eventListener
    AppActorPlugin.startEventListening()
  }

  override fun onHostPause() {
    // Do not clear the activity on pause. Google Play Billing only needs a
    // valid (not necessarily resumed) Activity to launch the billing flow, and
    // the WeakReference already prevents leaks. Clearing here would reject a
    // purchase dispatched during a transient pause with MISSING_ACTIVITY.
  }

  override fun onHostDestroy() {
    AppActorPlugin.setActivity(null)
  }

  override fun invalidate() {
    invalidated = true
    reactApplicationContext.removeLifecycleEventListener(this)
    // Only clear the global listener if it still points to this instance, so
    // teardown of one context cannot silence events for a surviving context.
    if (AppActorPlugin.eventListener === eventListener) {
      AppActorPlugin.eventListener = null
      AppActorPlugin.stopEventListening()
    }
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
