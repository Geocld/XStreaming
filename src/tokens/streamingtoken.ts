import Token, {TokenData} from './base';
import {getSettings} from '../store/settingStore';

export interface StreamingRegion {
  baseUri: string;
  name: string;
  isDefault?: boolean;
}

export interface StreamingTokenData extends TokenData {
  durationInSeconds: number;
  market: string;
  offeringSettings: {
    regions: StreamingRegion[];
    clientCloudSettings: {
      Environments: Record<string, unknown>;
    };
  };
}

export default class StreamingToken extends Token<StreamingTokenData> {
  private _objectCreateTime: number;
  public data: StreamingTokenData;

  constructor(tokenData: StreamingTokenData) {
    super(tokenData);
    this.data = tokenData;
    this._objectCreateTime = Date.now();
  }

  private get expirationDate(): Date | null {
    if (this._objectCreateTime && this.data.durationInSeconds) {
      return new Date(
        this._objectCreateTime + this.data.durationInSeconds * 1000,
      );
    }
    return null;
  }

  getSecondsValid(): number {
    const expiresOn = this.expirationDate;
    if (expiresOn) {
      return this.calculateSecondsLeft(expiresOn);
    }
    return 0;
  }

  isValid(): boolean {
    const expiresOn = this.expirationDate;
    if (expiresOn) {
      return this.calculateSecondsLeft(expiresOn) > 0;
    }
    return false;
  }

  getMarket(): string {
    return this.data.market;
  }

  getRegions(): StreamingRegion[] {
    return this.data.offeringSettings?.regions ?? [];
  }

  getDefaultRegion(): StreamingRegion | undefined {
    const _settings = getSettings();
    let isXHome = false;

    this.data.offeringSettings?.regions?.forEach(region => {
      if (region.baseUri.indexOf('xhome') > -1) {
        isXHome = true;
      }
    });

    const storeName = isXHome
      ? _settings.signaling_home_name
      : _settings.signaling_cloud_name;

    let finalRegion: StreamingRegion | undefined;
    this.data.offeringSettings?.regions?.forEach(region => {
      if (region.name === storeName) {
        finalRegion = region;
      }
    });

    if (!finalRegion) {
      finalRegion = this.data.offeringSettings?.regions?.find(
        region => region.isDefault,
      );
    }

    return finalRegion;
  }

  getEnvironments(): Record<string, unknown> | undefined {
    return this.data.offeringSettings?.clientCloudSettings?.Environments;
  }
}
