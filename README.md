<p align="center">
  <a href="https://github.com/Geocld/XStreaming">
    <img src="https://raw.githubusercontent.com/Geocld/XStreaming/main/images/logo.png" width="258">
  </a>
</p>

<p align="center">
  Open source Xbox streaming client that allows you to stream Xbox and play xCloud anytime, supporting Android/iOS.
</p>

**English** | [中文](./README.zh_CN.md)

## Intro

XStreaming is an open-source mobile client for xCloud and Xbox home streaming, great inspired by [Greenlight](https://github.com/unknownskl/greenlight).

> DISCLAIMER: XStreaming is not affiliated with Microsoft, Xbox. All rights and trademarks are property of their respective owners.

## iOS

`XStreaming` is now available on the Apple Store! Due to listing restrictions, it is named `PeaSyo` in the store. If you like this app, you can support us by purchasing it for the price of a cup of coffee.

<a href="https://apps.apple.com/us/app/peasyo/id6743263824">
    <img alt="Download on the App Store" src="https://raw.githubusercontent.com/Geocld/XStreaming/main/images/apple-store-badge.svg" style="height: 64px">
</a>

> XStreaming's code is fully open-source. You can build your own iOS version directly from the source code—simply fetch the code from the `ios` branch and compile it.

## HarmonyOS
`XStreaming` is now available on the HUAWEI App Gallery!

<a href="https://appgallery.huawei.com/app/detail?id=com.lijiahao.xstreamingoh" target="_blank">
    <img alt="Explore on App Gallery" src="https://raw.githubusercontent.com/Geocld/XStreaming/main/images/Huawei_AppGallery.png" style="height: 64px">
</a>


## Windows/MacOS/Linux(steamOS)

If you are looking for Windows/MacOS/Linux(steamOS) Xbox streaming application, you can use [XStreaming-desktop](https://github.com/Geocld/XStreaming-desktop) or [Greenlight](https://github.com/unknownskl/greenlight).

## Features

- Stream video and audio from the Xbox One and Xbox Series S/X
- Support for 1080P/1080P(HQ) resolution
- Support for virtual\OTG\bluetooth gamepad controls
- Support controller rumble
- Support Android TV
- Support rumble on xCloud without any proxy in some regions.
- Dual render engines
- Archivements system
- IPv6

<img src="https://raw.githubusercontent.com/Geocld/XStreaming/main/images/game.png" width="400" />
<img src="https://github.com/Geocld/XStreaming/blob/main/images/home.png" width="400" /> <img src="https://raw.githubusercontent.com/Geocld/XStreaming/main/images/xcloud.png" width="400" /><img src="https://raw.githubusercontent.com/Geocld/XStreaming/main/images/settings1.png" width="400" />

## Compatibility

XStreaming v2 introduces a dual-rendering engine mechanism, ensuring compatibility with devices running WebView versions below 91. If the streaming interface displays a blank screen or becomes unresponsive, navigate to `Settings > Rendering Engine > Select Native` to switch to the Android native rendering engine for video playback.

## Local Development

### Requirements
- [React Native](https://reactnative.dev/) = 0.72.14
- [NodeJs](https://nodejs.org/) >= 20
- [Yarn](https://yarnpkg.com/) >= 1.22

### Steps to get up and running

Clone the repository:

```
git clone https://github.com/Geocld/XStreaming
cd XStreaming
```

Install dependencies:

```
yarn
```

Run development build:

```
npm run android
```

## Development document

1. [Auth](/docs/1.Auth.md)
2. [Web API](./docs/2.Web.md)
3. [Stream](./docs/3.Stream.md)

## Developers

XStreaming's development can not be without these Hackers. They contributed a lot of capabilities for XStreaming. Also, welcome to follow them! ❤️

<!-- readme: contributors -start -->
<table>
<tr>
    <td align="center">
        <a href="https://github.com/Geocld">
            <img src="https://avatars.githubusercontent.com/u/13679095?v=4" width="90;" alt="Geocld"/>
            <br />
            <sub><b>Geocld</b></sub>
        </a>
    </td>
    <td align="center">
        <a href="https://github.com/wtlucky">
            <img src="https://avatars.githubusercontent.com/u/2265430?v=4" width="90;" alt="wtlucky"/>
            <br />
            <sub><b>wtlucky</b></sub>
        </a>
    </td>
    <td align="center">
        <a href="https://github.com/TigerBeanst">
            <img src="https://avatars.githubusercontent.com/u/3889846?v=4" width="90;" alt="TigerBeanst"/>
            <br />
            <sub><b>TigerBeanst</b></sub>
        </a>
    </td>
    <td align="center">
        <a href="https://github.com/Sirherobrine23">
            <img src="https://avatars.githubusercontent.com/u/50121801?v=4" width="90;" alt="Sirherobrine23"/>
            <br />
            <sub><b>Sirherobrine23</b></sub>
        </a>
    </td>
    <td align="center">
        <a href="https://github.com/rabin-HE">
            <img src="https://avatars.githubusercontent.com/u/96038890?v=4" width="90;" alt="rabin-HE"/>
            <br />
            <sub><b>rabin-HE</b></sub>
        </a>
    </td>
  </tr>
</table>
<!-- readme: contributors -end -->

### License

XStreaming is [MIT licensed](./LICENSE).
