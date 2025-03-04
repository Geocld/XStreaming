package com.xstreaming.input;

public class DSControllerPacket {
    
    // Face buttons flags
    public static final int CROSS_FLAG = 0x1000;
    public static final int MOON_FLAG = 0x2000;
    public static final int BOX_FLAG = 0x4000;
    public static final int PYRAMID_FLAG = 0x8000;

    // D-pad flags
    public static final int LEFT_FLAG = 0x0004;
    public static final int RIGHT_FLAG = 0x0008;
    public static final int UP_FLAG = 0x0001;
    public static final int DOWN_FLAG = 0x0002;

    // Shoulder buttons and triggers flags
    public static final int L1_FLAG = 0x0100;
    public static final int R1_FLAG = 0x0200;

    // Thumb stick click flags
    public static final int L3_FLAG = 0x0040;
    public static final int R3_FLAG = 0x0080;

    // Special buttons flags
    public static final int OPTIONS_FLAG = 0x0010;
    public static final int SHARE_FLAG = 0x0020;
    public static final int PS_FLAG = 0x0400;
}
