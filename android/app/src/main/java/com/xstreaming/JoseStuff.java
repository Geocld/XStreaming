package com.xstreaming;

import java.security.SignatureException;

//edited from, https://github.com/auth0/java-jwt/blob/master/lib/src/main/java/com/auth0/jwt/algorithms/ECDSAAlgorithm.java
/*
 * this is probably similar to ECDSA.transcodeSignatureToConcat, but I found this before I found that, and I don't care
 * to check if the ECDSA one works, this works and that's fine. But for an example ECDSASigner.sign
 */
public class JoseStuff {

    public static byte[] DERToJOSE(byte[] derSignature, AlgorithmType algorithmType) throws SignatureException {
        // DER Structure: http://crypto.stackexchange.com/a/1797
        boolean derEncoded = derSignature[0] == 0x30 && derSignature.length != algorithmType.ecNumberSize * 2;
        if (!derEncoded) {
            throw new SignatureException("Invalid DER signature format.");
        }

        final byte[] joseSignature = new byte[algorithmType.ecNumberSize * 2];

        //Skip 0x30
        int offset = 1;
        if (derSignature[1] == (byte) 0x81) {
            //Skip sign
            offset++;
        }

        //Convert to unsigned. Should match DER length - offset
        int encodedLength = derSignature[offset++] & 0xff;
        if (encodedLength != derSignature.length - offset) {
            throw new SignatureException("Invalid DER signature format.");
        }

        //Skip 0x02
        offset++;

        //Obtain R number length (Includes padding) and skip it
        int rLength = derSignature[offset++];
        if (rLength > algorithmType.ecNumberSize + 1) {
            throw new SignatureException("Invalid DER signature format.");
        }
        int rPadding = algorithmType.ecNumberSize - rLength;
        //Retrieve R number
        System.arraycopy(derSignature, offset + Math.max(-rPadding, 0), joseSignature, Math.max(rPadding, 0), rLength + Math.min(rPadding, 0));

        //Skip R number and 0x02
        offset += rLength + 1;

        //Obtain S number length. (Includes padding)
        int sLength = derSignature[offset++];
        if (sLength > algorithmType.ecNumberSize + 1) {
            throw new SignatureException("Invalid DER signature format.");
        }
        int sPadding = algorithmType.ecNumberSize - sLength;
        //Retrieve R number
        System.arraycopy(derSignature, offset + Math.max(-sPadding, 0), joseSignature, algorithmType.ecNumberSize + Math.max(sPadding, 0), sLength + Math.min(sPadding, 0));

        return joseSignature;
    }

    public enum AlgorithmType {
        ECDSA256(32), ECDSA384(48);

        public int ecNumberSize;

        AlgorithmType(int ecNumberSize) {
            this.ecNumberSize = ecNumberSize;
        }

    }

}
