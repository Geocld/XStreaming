export default {
  translation: {
    Consoles: 'Consoles',
    Xcloud: 'xCloud',
    Host: 'Host',
    Settings: 'Settings',
    NoLogin: 'Not logged in, please login',
    'Fetching user info...': 'Fetching user info...',
    'Fetching consoles...': 'Fetching consoles...',
    'Login successful, refreshing login credentials...':
      'The login was successful, refreshing login credentials...',
    'Checking login status...': 'Checking login status...',
    Warning: 'Warning',
    WaitingForServerToRegister:
      'Unable to establish streaming on the console because the console is not connected to the Xbox servers. When you see this error, it is not an issue with XStreaming. This usually occurs when the console system is abnormal, the console is updating, or the console is not logged into an account. Please try holding down the power button or disconnecting the power (disconnect for at least 10 seconds) to restart the console and resolve this issue.',
    XboxstreaminghelperErr:
      "The host streaming function is not working properly. When you see this error, it does not indicate an issue with XStreaming itself, but rather that the host's streaming functionality has stopped functioning due to certain reasons. You need to press and hold the power button or disconnect the power(at least 10s) supply to restart the host and resolve the issue. Specific error:",
    DisabledStreamingErr:
      'Streaming has been disabled on the client. This issue may be caused by:\n1. Xbox Console - Settings - Devices & connections - Remote features is not enabled;\n2. You may be using the China Mainland version of Xbox, which does not support streaming functionality.',
    'Login has expired or not logged in, please login again':
      'Login has expired or not logged in, please login again',
    AuthFailDesc: 'Login failed, please login again, error:',
    'Loading...': 'Loading...',
    'Start stream': 'Start stream',
    'Power on and start stream': 'Power on start stream',
    PoweredOnSentText: 'Power on command sent',
    PoweredOffSentText: 'Power off command sent',
    'Local connect': 'Local connect',
    'Remote connect': 'Remote connect',
    'Disconnect and power off': 'Disconnect and power off',
    NoConsoles:
      'No consoles found on your account. If you do have an Xbox console then make sure that remote playing is enabled and that the console is visible in the official Xbox App.',
    NoXGP:
      'You have not activated XGPU or do not have XGPU permission in your region. Please check your account permissions or change the region in settings and try again.',
    'Recent Games': 'Recent Games',
    'Recently added': 'Recently added',
    'All Games': 'All Games',
    'Set language of XStreaming': 'Set language of XStreaming',
    Resolution: 'Resolution',
    'Set resolution, support 720P/1080P/1080P(HQ).':
      'Set resolution, support 720P/1080P/1080P(HQ).',
    resolutionTips: `
1. 1080P (HQ) supports bitrate >=15Mbps for high-bitrate operation, providing higher clarity.
2. Host streaming only supports 720P/1080P/1080P (HQ).
3. 1440P is only supported for some xCloud games; console streaming does not support it.
4. xCloud currently has adjusted resolution policies by Microsoft. Some games for Xbox Game Pass Ultimate members only support 720P/1440P resolution.`,
    'Host stream bitrate': 'Host stream bitrate',
    'Cloud stream bitrate': 'Cloud stream bitrate',
    'Set the host streaming bitrate (Note: Higher bitrate is not always better; the final bitrate will be determined by streaming negotiation)':
      'Set the host streaming bitrate (Note: Higher bitrate is not always better; the final bitrate will be determined by streaming negotiation)',
    'Set the cloud streaming bitrate (Note: Higher bitrate is not always better; the final bitrate will be determined by streaming negotiation)':
      'Set the cloud streaming bitrate (Note: Higher bitrate is not always better; the final bitrate will be determined by streaming negotiation)',
    Codec: 'Codec',
    'If your device supports newer codecs, it can reduce the video bandwidth requirements.':
      'If your device supports newer codecs, it can reduce the video bandwidth requirements.',
    Vibration: 'Vibration',
    'If your controller supports vibration, you can set whether it vibrates during the game.':
      'If your controller supports vibration, you can set whether it vibrates during the game.',
    'Vibration mode': 'Vibration mode',
    'By default, the WebView kernel is used for vibration. If the controller does not vibrate, try using the native vibration mode':
      'By default, the WebView kernel is used for vibration. If the controller does not vibrate, try using the native vibration mode',
    'Joystick dead zone': 'Joystick dead zone',
    'Config joystick dead zone': 'Config joystick dead zone',
    'Set region': 'Set region',
    'Changing the region allows you to use XGPU services without a proxy':
      'Changing the region allows you to use XGPU services without a proxy',
    'Preferred language of game': 'Preferred language of game',
    'Set language of cloud game': 'Set language of cloud game',
    'Key mapping': 'Key mapping',
    'Mapping key of gamepad': 'Mapping key of gamepad',
    'Override native Xbox gamepad support': 'Override native gamepad support',
    noAllow:
      'Permission denied for cloud gaming. Please verify your login status and try logging in again. For cloud gaming, ensure you have an active XGPU subscription. For non-XGPU games, verify that you own the game',
    homeNoAllow:
      'Streaming permission check failed. Please check if your login has expired and try logging in again',
    bind_usb_device_description:
      'Force Peasyo’s USB driver to take over all supported /DualSense controllers (experimental)',
    bind_usb_device_tips:
      'This setting only takes effect for controllers that support XInput or DualSense protocol when connected via wired (OTG).',
    power_on_description:
      "Choose whether to power on the console when streaming. By default, the console remains in sleep mode, and the power light won't turn on during streaming. Enabling this option will fully power on the host and may wake up the monitor",
    low_latency_mode_description:
      "Use Android's Wi-Fi performance mode to achieve optimal streaming effects. This may cause Bluetooth latency on some devices. If you encounter Bluetooth latency issues, please choose to disable this mode.",
    Logout: 'Logout',
    'Do you want to logout?': 'Do you want to logout?',
    'Current user': 'Current user',
    BasesSettings: 'Basic',
    DisplaySettings: 'Display',
    GamepadSettings: 'Gamepad and Vibration',
    vGamepadSettings: 'Virtual controller',
    AudioSettings: 'Audio',
    XcloudSettings: 'Cloud Gaming',
    XchomeSettings: 'Console Streaming',
    SensorSettings: 'Sensor',
    TurnServerSettings: 'TURN Server',
    Auto: 'Auto',
    Custom: 'Custom',
    bitrate: 'bitrate',
    On: 'On',
    Off: 'Off',
    Current: 'Current',
    NoData: 'NoData',
    Gamerscore: 'Gamerscore',
    Default: 'Default',
    Australia: 'Australia',
    Brazil: 'Brazil',
    Europe: 'Europe',
    Japan: 'Japan',
    Korea: 'Korea',
    'United States': 'United States',
    Confirm: 'Confirm',
    Cancel: 'Cancel',
    Back: 'Back',
    Save: 'Save',
    Saved: 'Saved',
    Reset: 'Reset',
    Exit: 'Exit',
    gyroTitle: 'Enable Gyroscope',
    gyroDesc:
      'Whether to force the use of the device’s gyroscope. The gyroscope simulates the right stick.',
    gyroTips: 'Controller gyroscope is supported in Android 12+',
    gyroTypeTitle: 'Gyroscope Trigger Type',
    gyroTypeDesc:
      'Set the gyroscope trigger to activate on LT/LB press or globally',
    'LT press': 'LT Press',
    'LB press': 'LB Press',
    Global: 'Global',
    gyroSenTitleX: 'Gyroscope X-axis Sensitivity',
    gyroSenDescX: 'Adjust gyroscope X-axis sensitivity',
    gyroSenTitleY: 'Gyroscope Y-axis Sensitivity',
    gyroSenDescY: 'Adjust gyroscope Y-axis sensitivity',
    byorg:
      'This game is a self-purchased game, not part of the XGPU library. Please ensure that you have purchased this game to play.',
    compatibleWarn:
      'This game has compatibility issues with third-party streaming apps. It is recommended to play this game through official channels.',
    show_menu_title: 'Display Quick Menu',
    show_menu_desc:
      'The quick menu is always displayed in the lower right corner of the streaming page.',
    sensorInvertTitle: 'Invert Gyroscope Simulated Joystick',
    sensorInvertDesc:
      'The gyroscope direction on some devices may be opposite to the actual direction. you can invert the direction here.',
    x_axies: 'X Axis',
    y_axies: 'Y Axis',
    all_axies: 'All Axes',
    DualSense_adaptive_trigger_left: 'Set DualSense Left Trigger',
    DualSense_adaptive_trigger_left_desc:
      'You can set the DualSense left trigger to resistance/trigger/automatic trigger (to enable this feature, you need to turn on Android overlay driver (Settings - Overlay Android Controller Support - Enable), and connect the DualSense controller via cable)',
    DualSense_adaptive_trigger_right: 'Set DualSense Right Trigger',
    DualSense_adaptive_trigger_right_desc:
      'You can set the DualSense right trigger to resistance/trigger/automatic trigger (to enable this feature, you need to turn on Android overlay driver (Settings - Overlay Android Controller Support - Enable), and connect the DualSense controller via cable)',
    Audio_volume_title: 'Volume Control',
    Audio_volume_desc:
      'If the default maximum volume does not meet your expectations, you can choose to amplify the audio source here (Note: excessive volume may affect your hearing!)',
    'NAT failed':
      'NAT failed. If you are attempting remote streaming, please ensure your router is properly configured and port forwarding is set up. If you cannot resolve remote streaming issues, please use the official Xbox app.',
    'Reconnected failed':
      'Network has changed, reconnection failed, please reconnect',
    'Short Trigger': 'Short Trigger',
    ShortTriggerDesc:
      "If you want to convert the controller's analog trigger input to digital trigger input, or if you are using a controller with digital triggers (such as Switch/NS Pro), please enable this option",
    renderEngineTitle: 'Render Engine',
    renderEngineDesc:
      'You can choose between native/webview rendering engines to play the video stream.',
    renderEngineTips:
      '\nnative: No dependency on webview, uses native rendering for lower power consumption and better compatibility(recommend).\n\nwebview: Uses the system webview to play video streams, requiring webview version 91 or higher.\n\nDifferent rendering engines have their own advantages and disadvantages. Please choose based on the actual performance of the device.',
    'Device testing': 'Device testing',
    'Testing current device and controller':
      'Testing current device and controller',
    Rumble1s: 'Rumble1s',
    'Stop rumble': 'Stop rumble',
    ControllerRumble: 'Controller Rumble',
    Refresh: 'Refresh',
    Model: 'Model',
    'Android Version': 'Android Version',
    'API Version': 'API Version',
    'Kernal Version': 'Kernel Version',
    'Webview Version': 'Webview Version',
    'Device rumble': 'Device rumble',
    supported: 'supported',
    unsupported: 'unsupported',
    lowThanAndroid12: 'Below Android 12',
    Controllers: 'Controllers',
    Name: 'Name',
    Rumble: 'Rumble',
    Sensor: 'Sensor',
    Details: 'Details',
    Size: 'Size',
    ShowTitle: 'Display',
    Show: 'Show',
    Hide: 'Hide',
    virtual_joystick_title: 'Virtual Joystick Layout',
    virtual_joystick_desc: 'Set the virtual joystick layout to Fixed/Free mode',
    virtual_joystick_tips:
      'In Free mode, the left/right joystick can be operated in blank areas on either side of the screen',
    Fixed: 'Fixed',
    Free: 'Free',
    History: 'History',
    HistoryTitle: 'Update histories',
    HistoryDesc: 'View update histories of XStreaming',
    'TURN server': 'TURN server',
    'Custom TURN server': 'Custom TURN server',
    UrlIncorrect: 'Server URL format is incorrect',
    Username: 'Username',
    Password: 'Password',
    inner_server_title: 'Inner TURN server',
    inner_server_desc:
      'Use the official built-in XStreaming server, but stability is not guaranteed. It is disabled by default; enable it as needed.',
    'Auto toggle hold buttons': 'Auto toggle hold buttons',
    'Select what buttons become toggle holdable':
      'Select what buttons become toggle holdable',
    HoldButtonsSettingsDesc:
      'The auto toggle hold buttons feature allows you to automatically keep a button pressed when you hold it down, until you click the button again. This is useful for game scenarios that require continuous button presses, such as acceleration in racing games or firing in shooting games.',
    'Hold Buttons': 'Hold Buttons',
  },
};
