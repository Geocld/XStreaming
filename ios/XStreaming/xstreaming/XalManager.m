#import "XalManager.h"
#import <CommonCrypto/CommonCrypto.h>

@implementation XalManager

RCT_EXPORT_MODULE()

+ (BOOL)requiresMainQueueSetup
{
    return NO;
}

- (void)dealloc
{
    if (_privateKey) {
        CFRelease(_privateKey);
        _privateKey = NULL;
    }
    if (_publicKey) {
        CFRelease(_publicKey);
        _publicKey = NULL;
    }
}

- (NSData *)bigIntegerToData:(NSData *)data
{
    if (data.length > 0 && ((uint8_t *)data.bytes)[0] == 0x00) {
        return [data subdataWithRange:NSMakeRange(1, data.length - 1)];
    }
    return data;
}

- (NSString *)base64URLEncode:(NSData *)data
{
    NSString *base64 = [data base64EncodedStringWithOptions:0];
    base64 = [base64 stringByReplacingOccurrencesOfString:@"+" withString:@"-"];
    base64 = [base64 stringByReplacingOccurrencesOfString:@"/" withString:@"_"];
    base64 = [base64 stringByReplacingOccurrencesOfString:@"=" withString:@""];
    return base64;
}

- (int64_t)windowsTimestamp
{
    NSTimeInterval unixTimestamp = [[NSDate date] timeIntervalSince1970];
    return (int64_t)((unixTimestamp + 11644473600.0) * 10000000.0);
}

RCT_EXPORT_METHOD(init:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    if (self.privateKey) {
        CFRelease(self.privateKey);
        self.privateKey = NULL;
    }
    if (self.publicKey) {
        CFRelease(self.publicKey);
        self.publicKey = NULL;
    }
    
    CFErrorRef error = NULL;
    SecAccessControlRef access = SecAccessControlCreateWithFlags(kCFAllocatorDefault,
                                                               kSecAttrAccessibleAfterFirstUnlock,
                                                               0,
                                                               &error);
    if (error) {
        NSString *errorMessage = (__bridge_transfer NSString *)CFErrorCopyDescription(error);
        CFRelease(error);
        reject(@"INIT_ERROR", errorMessage, nil);
        return;
    }
    
    NSDictionary *attributes = @{
        (__bridge NSString *)kSecAttrKeyType: (__bridge NSString *)kSecAttrKeyTypeECSECPrimeRandom,
        (__bridge NSString *)kSecAttrKeySizeInBits: @256,
        (__bridge NSString *)kSecPrivateKeyAttrs: @{
            (__bridge NSString *)kSecAttrIsPermanent: @NO,
            (__bridge NSString *)kSecAttrAccessControl: (__bridge id)access
        }
    };
    
    CFRelease(access);
    
    SecKeyRef privateKey = SecKeyCreateRandomKey((__bridge CFDictionaryRef)attributes, &error);
    if (error) {
        NSString *errorMessage = (__bridge_transfer NSString *)CFErrorCopyDescription(error);
        CFRelease(error);
        reject(@"INIT_ERROR", errorMessage, nil);
        return;
    }
    
    SecKeyRef publicKey = SecKeyCopyPublicKey(privateKey);
    
    _privateKey = privateKey;
    _publicKey = publicKey;
    
    resolve(@(YES));
}

RCT_EXPORT_METHOD(nextUUID:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    resolve([[NSUUID UUID] UUIDString]);
}

RCT_EXPORT_METHOD(getKeyX:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    CFErrorRef error = NULL;
    CFDataRef keyData = SecKeyCopyExternalRepresentation(self.publicKey, &error);
    if (error) {
        NSString *errorMessage = (__bridge_transfer NSString *)CFErrorCopyDescription(error);
        CFRelease(error);
        reject(@"KEY_ERROR", errorMessage, nil);
        return;
    }
    
    NSData *data = (__bridge_transfer NSData *)keyData;
    NSData *xData = [data subdataWithRange:NSMakeRange(1, 32)];
    resolve([self base64URLEncode:[self bigIntegerToData:xData]]);
}

RCT_EXPORT_METHOD(getKeyY:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    CFErrorRef error = NULL;
    CFDataRef keyData = SecKeyCopyExternalRepresentation(self.publicKey, &error);
    if (error) {
        NSString *errorMessage = (__bridge_transfer NSString *)CFErrorCopyDescription(error);
        CFRelease(error);
        reject(@"KEY_ERROR", errorMessage, nil);
        return;
    }
    
    NSData *data = (__bridge_transfer NSData *)keyData;
    NSData *yData = [data subdataWithRange:NSMakeRange(33, 32)];
    resolve([self base64URLEncode:[self bigIntegerToData:yData]]);
}

RCT_EXPORT_METHOD(sign:(NSString *)url
                  authorizationToken:(NSString *)authorizationToken
                  postData:(NSString *)postData
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    int64_t currentTime = [self windowsTimestamp];
    
    NSMutableData *bytesToSign = [NSMutableData data];
    uint8_t header[] = {0, 0, 0, 1, 0};
    [bytesToSign appendBytes:header length:sizeof(header)];
    
    [bytesToSign appendBytes:&currentTime length:sizeof(currentTime)];
    uint8_t zero = 0;
    [bytesToSign appendBytes:&zero length:1];
    
    [bytesToSign appendData:[@"POST" dataUsingEncoding:NSUTF8StringEncoding]];
    [bytesToSign appendBytes:&zero length:1];
    
    NSURL *_url = [NSURL URLWithString:url];
    NSString *pathAndQuery = _url.path ?: @"";
    [bytesToSign appendData:[pathAndQuery dataUsingEncoding:NSUTF8StringEncoding]];
    [bytesToSign appendBytes:&zero length:1];
    
    [bytesToSign appendData:[authorizationToken dataUsingEncoding:NSUTF8StringEncoding]];
    [bytesToSign appendBytes:&zero length:1];
    
    [bytesToSign appendData:[postData dataUsingEncoding:NSUTF8StringEncoding]];
    [bytesToSign appendBytes:&zero length:1];
    
    CFErrorRef error = NULL;
    CFDataRef signature = SecKeyCreateSignature(self.privateKey,
                                              kSecKeyAlgorithmECDSASignatureDigestX962SHA256,
                                              (__bridge CFDataRef)bytesToSign,
                                              &error);
    if (error) {
        NSString *errorMessage = (__bridge_transfer NSString *)CFErrorCopyDescription(error);
        CFRelease(error);
        reject(@"SIGN_ERROR", errorMessage, nil);
        return;
    }
    
    NSData *signatureData = (__bridge_transfer NSData *)signature;
    NSMutableData *result = [NSMutableData data];
    uint8_t version[] = {0, 0, 0, 1};
    [result appendBytes:version length:sizeof(version)];
    [result appendBytes:&currentTime length:sizeof(currentTime)];
    [result appendData:signatureData];
    
    resolve([result base64EncodedStringWithOptions:0]);
}

RCT_EXPORT_METHOD(getCodeChallange:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    // 生成随机字节序列
    NSMutableData *randomBytes = [NSMutableData dataWithLength:32];
    if (SecRandomCopyBytes(kSecRandomDefault, 32, randomBytes.mutableBytes) != errSecSuccess) {
        reject(@"RANDOM_ERROR", @"Failed to generate random bytes", nil);
        return;
    }
    
    // 生成 code_verifier
    NSString *codeVerifier = [self base64URLEncode:randomBytes];
    
    // 计算 SHA-256 哈希
    NSData *verifierData = [codeVerifier dataUsingEncoding:NSUTF8StringEncoding];
    uint8_t hash[CC_SHA256_DIGEST_LENGTH];
    CC_SHA256(verifierData.bytes, (CC_LONG)verifierData.length, hash);
    NSData *challengeData = [NSData dataWithBytes:hash length:CC_SHA256_DIGEST_LENGTH];
    
    // 生成 code_challenge
    NSString *codeChallenge = [self base64URLEncode:challengeData];
    
    resolve(@{
        @"value": codeChallenge,
        @"method": @"S256",
        @"verifier": codeVerifier
    });
}

RCT_EXPORT_METHOD(getRandomState:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    NSMutableData *randomBytes = [NSMutableData dataWithLength:64];
    if (SecRandomCopyBytes(kSecRandomDefault, 64, randomBytes.mutableBytes) != errSecSuccess) {
        reject(@"RANDOM_ERROR", @"Failed to generate random bytes", nil);
        return;
    }
    resolve([self base64URLEncode:randomBytes]);
}

@end