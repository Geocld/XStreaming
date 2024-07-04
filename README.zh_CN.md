<p align="center">
  <a href="https://github.com/Geocld/XStreaming">
    <img src="https://raw.githubusercontent.com/Geocld/XStreaming/main/images/logo.png" width="546">
  </a>
</p>

<p align="center">
  开源Xbox/云游戏串流应用.
</p>

**English** | [中文](./README.zh_CN.md)

## Intro

XStreaming是一款开源的Xbox/云游戏串流移动端客户端，借鉴了[Greenlight](https://github.com/unknownskl/greenlight)提供的API接口和相关实现，推荐在Android10+版本上运行。

> 声明: XStreaming与Microsoft、Xbox没有关联。所有权和商标属于其各自所有者。

## 功能

- 串流Xbox One、Xbox Series S/X的音视频
- 支持1080P分辨率
- 支持外接、蓝牙、虚拟手柄，支持手柄振动
- 支持手柄按键映射
- 免代理云游戏
- IPv6优先连接支持

<img src="https://raw.githubusercontent.com/Geocld/XStreaming/main/images/game.jpg" width="400" />
<img src="https://github.com/Geocld/XStreaming/blob/main/images/home.jpg" width="400" /> <img src="https://raw.githubusercontent.com/Geocld/XStreaming/main/images/xcloud.jpg" width="400" /><img src="https://raw.githubusercontent.com/Geocld/XStreaming/main/images/settings.jpg" width="400" />

## 本地开发

### 环境要求
- [React Native](https://reactnative.dev/) >= 0.74
- [NodeJs]((https://nodejs.org/)) >= 20
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