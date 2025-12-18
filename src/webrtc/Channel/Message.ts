import BaseChannel from './Base';

export default class MessageChannel extends BaseChannel {
  onOpen(event: any) {
    super.onOpen(event);
    console.log(
      'Channel/Message.ts - [' + this._channelName + '] onOpen:',
      event,
    );

    const handshake = JSON.stringify({
      type: 'Handshake',
      version: 'messageV1',
      id: 'f9c5f412-0e69-4ede-8e62-92c7f5358c56',
      cv: '',
    });
    this.send(handshake);
  }

  onMessage(event: any) {
    console.log(
      'Channel/Message.ts - [' + this._channelName + '] onMessage:',
      event,
    );

    const jsonMessage = JSON.parse(event.data);
    console.log('Channel/Message.ts - Received json:', jsonMessage);

    if (jsonMessage.type === 'HandshakeAck') {
      // Handshake has been acked.
      console.log('Message.ts Handshake has been acked.');

      this.getClient().getChannelProcessor('control').start();
      this.getClient().getChannelProcessor('input').start();

      // const systemUis = [10, 19, 31, 27, 32, -41];
      const systemUis: any = [];
      const systemVersion = [0, 1, 0];
      const uiConfig = JSON.stringify(
        this.generateMessage('/streaming/systemUi/configuration', {
          version: systemVersion,
          systemUis: systemUis, // Xbox Windows app has [33], xCloud has [10,19,31,27,32,-41]

          // 10 = ShowVirtualKeyboard
          // 19 = ShowMessageDialog
          // 31 = ShowApplication
          // 27 = ShowPurchase
          // 32 = ShowTimerExtensions
          // 33 = Xbox windows app, disables the nexus menu on xCloud (Alt nexus menu?)
          // -44 = unknown
          // 40 = unknown
          // 41 = unknown
          // -43 = unknown

          // Possible options: Keyboard, PurchaseModal
        }),
      );
      this.send(uiConfig);

      const clientConfig = JSON.stringify(
        this.generateMessage(
          '/streaming/properties/clientappinstallidchanged',
          {clientAppInstallId: '4b8f472d-2c82-40e8-895d-bcd6a6ec7e9b'},
        ),
      );
      this.send(clientConfig);

      const orientationConfig = JSON.stringify(
        this.generateMessage('/streaming/characteristics/orientationchanged', {
          orientation: 0,
        }),
      );
      this.send(orientationConfig);

      const touchConfig = JSON.stringify(
        this.generateMessage(
          '/streaming/characteristics/touchinputenabledchanged',
          {touchInputEnabled: false},
        ),
      );
      this.send(touchConfig);

      const deviceConfig = JSON.stringify(
        this.generateMessage(
          '/streaming/characteristics/clientdevicecapabilities',
          {},
        ),
      );
      this.send(deviceConfig);

      const dimensionsConfig = JSON.stringify(
        this.generateMessage('/streaming/characteristics/dimensionschanged', {
          horizontal: 1920,
          vertical: 1080,
          preferredWidth: 1920,
          preferredHeight: 1080,
          safeAreaLeft: 0,
          safeAreaTop: 0,
          safeAreaRight: 1920,
          safeAreaBottom: 1080,
          supportsCustomResolution: true,
        }),
      );
      console.log('send dimensionsConfig:', dimensionsConfig);
      this.send(dimensionsConfig);
    }
  }

  onClose(event: any) {
    super.onClose(event);
  }

  generateMessage(path: string, data: any) {
    return {
      type: 'Message',
      content: JSON.stringify(data),
      id: '41f93d5a-900f-4d33-b7a1-2d4ca6747072',
      target: path,
      cv: '',
    };
  }
}
