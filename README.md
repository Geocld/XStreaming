<p align="center">
  <a href="https://github.com/Geocld/XStreaming">
    <img src="https://raw.githubusercontent.com/Geocld/XStreaming/main/images/logo.png" width="546">
  </a>
</p>

<p align="center">
  Opensource Xbox Remote Client.
</p>

**English** | [中文](./README.zh_CN.md)

## Intro

XStreaming is an open-source mobile client for xCloud and Xbox home streaming, great inspired by [Greenlight](https://github.com/unknownskl/greenlight).The application runs on Android 10+.

> DISCLAIMER: XStreaming is not affiliated with Microsoft, Xbox. All rights and trademarks are property of their respective owners.

## Features

- Stream video and audio from the Xbox One and Xbox Series S/X
- Support for 1080P resolution
- Support for virtual\OTG\bluetooth gamepad controls
- Support gamepad vibration
- Supports rumble on xCloud without any proxy in some regions.

<img src="https://raw.githubusercontent.com/Geocld/XStreaming/main/images/game.jpg" width="400" />
<img src="https://github.com/Geocld/XStreaming/blob/main/images/home.jpg" width="400" /> <img src="https://raw.githubusercontent.com/Geocld/XStreaming/main/images/xcloud.jpg" width="400" /><img src="https://raw.githubusercontent.com/Geocld/XStreaming/main/images/settings.jpg" width="400" />

## Local Development

### Requirements
- [React Native](https://reactnative.dev/) >= 0.74
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