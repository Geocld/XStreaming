<p align="center">
  <a href="https://github.com/Geocld/XStreaming">
    <img src="https://raw.githubusercontent.com/Geocld/XStreaming/main/images/logo.png" width="258">
  </a>
</p>

<p align="center">
  开源Xbox/云游戏串流应用，支持Android/iOS.
</p>

## 介绍

XStreaming是一款开源的Xbox/云游戏串流移动端客户端，借鉴了[Greenlight](https://github.com/unknownskl/greenlight)提供的API接口和相关实现。

> 声明: XStreaming与Microsoft、Xbox没有关联。所有权和商标属于其各自所有者。

## iOS

`XStreaming`已经上架Apple store！因为上架限制商店命名`PeaSyo`。如果你喜欢这个应用，不妨花一杯咖啡的钱在商店买入来支持我们：

<a href="https://apps.apple.com/cn/app/peasyo/id6743263824">
    <img alt="Download on the App Store" src="https://raw.githubusercontent.com/Geocld/XStreaming/main/images/apple-store-badge.svg" style="height: 64px">
</a>

> XStreaming代码是完全开源的，你可以直接从源码构建自己的iOS版本，只需在`ios`分支获取代码即可编译。

## Windows/MacOS/Linux(steamOS)

如果你在找 Windows/MacOS/Linux(steamOS) 平台的xbox串流应用, 请使用 [XStreaming-desktop](https://github.com/Geocld/XStreaming-desktop) 或 [Greenlight](https://github.com/unknownskl/greenlight).

## 功能

- 串流Xbox One、Xbox Series S/X的音视频
- 支持1080P/1080P(HQ)
- 支持外接、蓝牙、虚拟手柄，支持手柄振动
- 支持Webview/Native双渲染模式切换
- 支持手柄按键映射
- 支持Android TV
- 免代理云游戏
- 成就系统
- IPv6优先连接支持

<img src="https://raw.githubusercontent.com/Geocld/XStreaming/main/images/game.png" width="400" />
<img src="https://github.com/Geocld/XStreaming/blob/main/images/home.png" width="400" /> <img src="https://raw.githubusercontent.com/Geocld/XStreaming/main/images/xcloud.png" width="400" /><img src="https://raw.githubusercontent.com/Geocld/XStreaming/main/images/settings1.png" width="400" />

## 兼容性
XStreaming v2新增了双渲染内核机制，已兼容webview低于91的设备，如果串流界面出现白屏或无响应的情况，请在`设置 - 渲染引擎 - 选择Native`，即可用安卓原生渲染引擎播放视频流。

## 本地开发

### 环境要求
- [React Native](https://reactnative.dev/) = 0.72.14
- [NodeJs](https://nodejs.org/) >= 20
- [Yarn](https://yarnpkg.com/) >= 1.22

### 运行项目

克隆本项目到本地:

```
git clone https://github.com/Geocld/XStreaming
cd XStreaming
```
安装依赖:

```
yarn
```

启动开发模式:

```
npm run android
```

## 开发文档

1. [登录认证，获得串流凭据](./docs/1.Auth_zh.md)
2. [Web API](./docs/2.Web_zh.md)
3. [串流](./docs/3.Stream_zh.md)

## 开发者

XStreaming 的发展离不开这些 Hacker 们，他们贡献了大量能力，也欢迎关注他们 ❤️

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

### 开源协议

XStreaming 遵循 [MIT 协议](./LICENSE).
