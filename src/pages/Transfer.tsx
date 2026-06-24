import React from 'react';
import {Alert, NativeModules, ScrollView, StyleSheet, View} from 'react-native';
import {Button, Divider, HelperText, Text} from 'react-native-paper';
import {useTranslation} from 'react-i18next';
import RNRestart from 'react-native-restart';
import TokenStore from '../xal/tokenstore';
import {getSettings, saveSettings} from '../store/settingStore';
import {
  getSettings as getGamepadSettings,
  saveAllSettings as saveGamepadSettings,
} from '../store/gamepadStore';
import {getStreamToken, saveStreamToken} from '../store/streamTokenStore';
import {getWebToken, saveWebToken} from '../store/webTokenStore';
import {getConsolesData, saveConsolesData} from '../store/consolesStore';
import {getServerData, saveServerData} from '../store/serverStore';

const {ConfigTransferModule} = NativeModules;

type ExportConfig = {
  app: string;
  version: number;
  exportedAt: string;
  account?: {
    tokenStore?: any;
    streamToken?: any;
    webToken?: any;
    consolesData?: any;
  };
  settings?: any;
  gamepadSettings?: any;
  serverData?: any;
};

const isObject = (value: any) =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const buildExportConfig = (): ExportConfig => {
  const tokenStore = new TokenStore();
  tokenStore.load();

  return {
    app: 'XStreaming',
    version: 1,
    exportedAt: new Date().toISOString(),
    account: {
      tokenStore: tokenStore.exportData(),
      streamToken: getStreamToken(),
      webToken: getWebToken(),
      consolesData: getConsolesData(),
    },
    settings: getSettings(),
    gamepadSettings: getGamepadSettings(),
    serverData: getServerData(),
  };
};

const restoreConfig = (config: ExportConfig) => {
  if (!isObject(config)) {
    throw new Error('Invalid config file');
  }

  const account = config.account || {};
  if (isObject(account.tokenStore)) {
    const tokenStore = new TokenStore();
    tokenStore.saveData(account.tokenStore);
  }

  if (account.streamToken !== undefined && account.streamToken !== null) {
    saveStreamToken(account.streamToken);
  }

  if (account.webToken !== undefined && account.webToken !== null) {
    saveWebToken(account.webToken);
  }

  if (isObject(account.consolesData)) {
    saveConsolesData(account.consolesData);
  }

  if (isObject(config.settings)) {
    saveSettings(config.settings);
  }

  if (isObject(config.gamepadSettings)) {
    saveGamepadSettings(config.gamepadSettings);
  }

  if (isObject(config.serverData)) {
    saveServerData(config.serverData);
  }
};

function TransferScreen() {
  const {t} = useTranslation();

  const handleExport = async () => {
    if (!ConfigTransferModule?.createAndShareConfigFile) {
      Alert.alert(t('Warning'), t('ConfigTransferUnavailable'));
      return;
    }

    try {
      const config = buildExportConfig();
      const fileName = `xstreaming_export_${Date.now()}.json`;
      await ConfigTransferModule.createAndShareConfigFile(
        fileName,
        JSON.stringify(config, null, 2),
      );
      Alert.alert(t('Warning'), t('ExportSuccess'));
    } catch (error: any) {
      Alert.alert(t('Warning'), `${t('ExportFail')}: ${error.message}`);
    }
  };

  const handleImport = async () => {
    if (!ConfigTransferModule?.importConfigFile) {
      Alert.alert(t('Warning'), t('ConfigTransferUnavailable'));
      return;
    }

    try {
      const fileContent = await ConfigTransferModule.importConfigFile();
      const config = JSON.parse(fileContent);
      restoreConfig(config);
      Alert.alert(t('Warning'), t('ImportSuccess'));
      setTimeout(() => {
        RNRestart.restart();
      }, 1000);
    } catch (error: any) {
      if (error?.code === 'USER_CANCEL') {
        Alert.alert(t('Warning'), t('UserCancel'));
        return;
      }
      Alert.alert(t('Warning'), `${t('ImportFail')}: ${error.message}`);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.block}>
        <Text style={styles.title} variant="titleMedium">
          {t('ExportDesc')}
        </Text>
        <HelperText type="info" visible={true}>
          {t('ExportTips')}
        </HelperText>
        <Button mode="contained" onPress={handleExport}>
          {t('ExportSettings')}
        </Button>
      </View>

      <Divider />

      <View style={styles.block}>
        <Text style={styles.title} variant="titleMedium">
          {t('ImportDesc')}
        </Text>
        <HelperText type="info" visible={true}>
          {t('ImportTips')}
        </HelperText>
        <Button mode="contained" onPress={handleImport}>
          {t('ImportSettings')}
        </Button>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingLeft: 20,
    paddingRight: 20,
  },
  block: {
    paddingTop: 40,
    paddingBottom: 40,
  },
  title: {
    paddingBottom: 10,
  },
});

export default TransferScreen;
