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

RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(init)
{
    self = [super init];
    if (self) {
        CFErrorRef error = NULL;
        SecAccessControlRef access = SecAccessControlCreateWithFlags(kCFAllocatorDefault,
                                                                   kSecAttrAccessibleAfterFirstUnlock,
                                                                   0,
                                                                   &error);
        if (error) {
            CFRelease(error);
            return nil;
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
            CFRelease(error);
            return nil;
        }
        
        SecKeyRef publicKey = SecKeyCopyPublicKey(privateKey);
        
        _privateKey = privateKey;
        _publicKey = publicKey;
        
    }
    return self;
}

RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(nextUUID)
{
    return [[NSUUID UUID] UUIDString];
}

RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(getKeyX)
{
    CFErrorRef error = NULL;
    CFDataRef keyData = SecKeyCopyExternalRepresentation(self.publicKey, &error);
    if (error) {
        CFRelease(error);
        return @"";
    }
    
    NSData *data = (__bridge_transfer NSData *)keyData;
    NSData *xData = [data subdataWithRange:NSMakeRange(1, 32)];
    return [self base64URLEncode:[self bigIntegerToData:xData]];
}

RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(getKeyY)
{
    CFErrorRef error = NULL;
    CFDataRef keyData = SecKeyCopyExternalRepresentation(self.publicKey, &error);
    if (error) {
        CFRelease(error);
        return @"";
    }
    
    NSData *data = (__bridge_transfer NSData *)keyData;
    NSData *yData = [data subdataWithRange:NSMakeRange(33, 32)];
    return [self base64URLEncode:[self bigIntegerToData:yData]];
}

RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(sign:(NSString *)url
                  authorizationToken:(NSString *)authorizationToken
                  postData:(NSString *)postData)
{
    NSLog(@"Sign method started - privateKey: %@", self.privateKey ? @"exists" : @"null");
    NSLog(@"URL: %@", url);
    NSLog(@"Auth Token: %@", authorizationToken);
    NSLog(@"Post Data: %@", postData);
    
    if (!self.privateKey) {
        NSLog(@"Private key is null, please check if init method was called");
        return @"";
    }
    
    int64_t currentTime = [self windowsTimestamp];
    int64_t networkOrderTime = CFSwapInt64HostToBig(currentTime);
    
    NSMutableData *bytesToSign = [NSMutableData data];
    uint8_t header[] = {0, 0, 0, 1, 0};
    [bytesToSign appendBytes:header length:sizeof(header)];
    
    [bytesToSign appendBytes:&networkOrderTime length:sizeof(networkOrderTime)];
    uint8_t zero = 0;
    [bytesToSign appendBytes:&zero length:1];
    
    [bytesToSign appendData:[@"POST" dataUsingEncoding:NSUTF8StringEncoding]];
    [bytesToSign appendBytes:&zero length:1];
    
    NSURL *_url = [NSURL URLWithString:url];
    if (!_url) {
        NSLog(@"Invalid URL format");
        return @"";
    }
    
    NSString *pathAndQuery = _url.path ?: @"";
    NSLog(@"Path and query: %@", pathAndQuery);
    
    [bytesToSign appendData:[pathAndQuery dataUsingEncoding:NSUTF8StringEncoding]];
    [bytesToSign appendBytes:&zero length:1];
    
    [bytesToSign appendData:[authorizationToken dataUsingEncoding:NSUTF8StringEncoding]];
    [bytesToSign appendBytes:&zero length:1];
    
    [bytesToSign appendData:[postData dataUsingEncoding:NSUTF8StringEncoding]];
    [bytesToSign appendBytes:&zero length:1];
    
    // 计算 SHA256 哈希
    uint8_t hash[CC_SHA256_DIGEST_LENGTH];
    CC_SHA256(bytesToSign.bytes, (CC_LONG)bytesToSign.length, hash);
    NSData *hashData = [NSData dataWithBytes:hash length:CC_SHA256_DIGEST_LENGTH];
    
    NSLog(@"Hash data length: %lu", (unsigned long)hashData.length);
    
    // 创建签名
    CFErrorRef error = NULL;
    CFDataRef signature = SecKeyCreateSignature(self.privateKey,
                                              kSecKeyAlgorithmECDSASignatureDigestX962SHA256,
                                              (__bridge CFDataRef)hashData,
                                              &error);
    if (error) {
        NSError *err = (__bridge NSError *)error;
        NSLog(@"Signature creation failed with error: %@", err);
        CFRelease(error);
        return @"";
    }
    
    if (!signature) {
        NSLog(@"Signature is null even without error");
        return @"";
    }
    
    NSLog(@"Signature created successfully with length: %ld", CFDataGetLength(signature));
    
    // 转换签名格式（从 DER 到 raw R||S 格式）
    NSData *derSignature = (__bridge_transfer NSData *)signature;
    NSData *rawSignature = [self convertDERSignatureToRaw:derSignature];
    
    if (!rawSignature) {
        NSLog(@"Failed to convert signature format");
        return @"";
    }
    
    // 构建最终结果
    NSMutableData *result = [NSMutableData data];
    uint8_t version[] = {0, 0, 0, 1};
    [result appendBytes:version length:sizeof(version)];
    [result appendBytes:&networkOrderTime length:sizeof(networkOrderTime)];
    [result appendData:rawSignature];
    
    return [result base64EncodedStringWithOptions:0];
}

// 添加新的辅助方法来转换签名格式
- (NSData *)convertDERSignatureToRaw:(NSData *)derSignature {
    const uint8_t *bytes = derSignature.bytes;
    if (derSignature.length < 2 || bytes[0] != 0x30) {
        return nil;
    }
    
    NSInteger length = bytes[1];
    if (derSignature.length < length + 2) {
        return nil;
    }
    
    const uint8_t *ptr = bytes + 2;
    NSInteger remaining = length;
    
    // 读取 R 值
    if (remaining < 2 || ptr[0] != 0x02) {
        return nil;
    }
    
    NSInteger rLength = ptr[1];
    ptr += 2;
    remaining -= 2;
    
    if (remaining < rLength) {
        return nil;
    }
    
    NSData *rData = [NSData dataWithBytes:ptr length:rLength];
    ptr += rLength;
    remaining -= rLength;
    
    // 读取 S 值
    if (remaining < 2 || ptr[0] != 0x02) {
        return nil;
    }
    
    NSInteger sLength = ptr[1];
    ptr += 2;
    remaining -= 2;
    
    if (remaining < sLength) {
        return nil;
    }
    
    NSData *sData = [NSData dataWithBytes:ptr length:sLength];
    
    // 确保 R 和 S 都是 32 字节
    NSMutableData *r = [NSMutableData dataWithData:rData];
    NSMutableData *s = [NSMutableData dataWithData:sData];
    
    // 处理 R 值
    if (r.length < 32) {
        NSInteger paddingLength = 32 - r.length;
        uint8_t *padding = calloc(paddingLength, sizeof(uint8_t));
        [r replaceBytesInRange:NSMakeRange(0, 0) withBytes:padding length:paddingLength];
        free(padding);
    }
    
    // 处理 S 值
    if (s.length < 32) {
        NSInteger paddingLength = 32 - s.length;
        uint8_t *padding = calloc(paddingLength, sizeof(uint8_t));
        [s replaceBytesInRange:NSMakeRange(0, 0) withBytes:padding length:paddingLength];
        free(padding);
    }
    
    // 如果长度超过 32 字节，且首字节为 0，则删除
    while (r.length > 32 && ((uint8_t *)r.bytes)[0] == 0) {
        [r replaceBytesInRange:NSMakeRange(0, 1) withBytes:NULL length:0];
    }
    
    while (s.length > 32 && ((uint8_t *)s.bytes)[0] == 0) {
        [s replaceBytesInRange:NSMakeRange(0, 1) withBytes:NULL length:0];
    }
    
    if (r.length != 32 || s.length != 32) {
        return nil;
    }
    
    // 合并 R 和 S
    NSMutableData *result = [NSMutableData dataWithData:r];
    [result appendData:s];
    
    return result;
}

RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(getCodeChallange)
{
    // 生成随机字节序列
    NSMutableData *randomBytes = [NSMutableData dataWithLength:32];
    if (SecRandomCopyBytes(kSecRandomDefault, 32, randomBytes.mutableBytes) != errSecSuccess) {
        return @{};
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
    
    return @{
        @"value": codeChallenge,
        @"method": @"S256",
        @"verifier": codeVerifier
    };
}

RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(getRandomState)
{
    NSMutableData *randomBytes = [NSMutableData dataWithLength:64];
    if (SecRandomCopyBytes(kSecRandomDefault, 64, randomBytes.mutableBytes) != errSecSuccess) {
        return @"";
    }
    return [self base64URLEncode:randomBytes];
}

@end
