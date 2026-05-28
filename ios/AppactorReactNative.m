#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(AppactorReactNative, RCTEventEmitter)

RCT_EXTERN_METHOD(execute:(NSString *)method
                  payload:(NSString *)payload
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
