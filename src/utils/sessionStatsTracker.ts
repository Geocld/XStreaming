import NetInfo from '@react-native-community/netinfo';

export type SessionReportData = {
  gameTitle: string;
  durationSeconds: number;
  durationFormatted: string;
  score: number;
  qualityText: 'Excellent' | 'Good' | 'Fair' | 'Poor';
  qualityColor: string;
  latencyAvg: number;
  latencyPeak: number;
  bitrateAvg: number;
  bitratePeak: number;
  packetLossAvg: number;
  packetLossPeak: number;
  packetLossStatus: 'Stable' | 'Moderate' | 'High';
  jitterAvg: number;
  jitterPeak: number;
  fpsAvg: number;
  fpsTarget: number;
  decodeAvg: number;
  decodePeak: number;
  resolution: string;
  codec: string;
  networkInfo: string;
  totalDownloadBytes: number;
  totalUploadBytes: number;
  totalDownloadFormatted: string;
  totalUploadFormatted: string;
};

export interface SessionStatsSample {
  rtt?: number | string;
  bitrate?: number | string;
  packetLoss?: number | string;
  jitter?: number | string;
  fps?: number | string;
  decode?: number | string;
  resolution?: string;
  frameWidth?: number;
  frameHeight?: number;
  codec?: string;
  bytesReceived?: number;
  bytesSent?: number;
}

const parseNumeric = (val: any): number | null => {
  if (typeof val === 'number') {
    return isNaN(val) ? null : val;
  }
  if (typeof val === 'string') {
    const percentMatch = val.match(/\(([\d.]+)%\)/);
    if (percentMatch && percentMatch[1]) {
      const parsed = parseFloat(percentMatch[1]);
      return isNaN(parsed) ? null : parsed;
    }
    const match = val.match(/[\d.]+/);
    if (match) {
      const parsed = parseFloat(match[0]);
      return isNaN(parsed) ? null : parsed;
    }
  }
  return null;
};

const formatDuration = (totalSeconds: number): string => {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;

  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${minutes}:${pad(seconds)}`;
};

export const formatDataUsage = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return `${gb.toFixed(2)} GB`;
  }
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    return `${mb >= 100 ? Math.round(mb) : mb.toFixed(1)} MB`;
  }
  const kb = bytes / 1024;
  return `${Math.max(1, Math.round(kb))} KB`;
};

class SessionStatsTracker {
  private _sessionStartTime: number = 0;
  private _gameTitle: string = 'Xbox Cloud Gaming';
  private _codec: string = 'H.264';
  private _resolution: string = '1920x1080';
  private _networkInfo: string = 'Wi-Fi';

  private _rttSamples: number[] = [];
  private _bitrateSamples: number[] = [];
  private _packetLossSamples: number[] = [];
  private _jitterSamples: number[] = [];
  private _fpsSamples: number[] = [];
  private _decodeSamples: number[] = [];
  private _maxBytesReceived: number = 0;
  private _maxBytesSent: number = 0;

  private _lastReport: SessionReportData | null = null;
  private _isActive: boolean = false;

  async startSession(params: {
    gameTitle?: string;
    streamType?: string;
    codec?: string;
    resolution?: string;
  }) {
    try {
      this._sessionStartTime = Date.now();
      this._isActive = true;
      this._gameTitle = params?.gameTitle || 'Xbox Cloud Gaming';
      this._codec = params?.codec ? params.codec.toUpperCase() : 'H.264';
      this._resolution = params?.resolution || '1920x1080';

      this._rttSamples = [];
      this._bitrateSamples = [];
      this._packetLossSamples = [];
      this._jitterSamples = [];
      this._fpsSamples = [];
      this._decodeSamples = [];
      this._maxBytesReceived = 0;
      this._maxBytesSent = 0;
      this._lastReport = null;

      try {
        const netState: any = await NetInfo.fetch();
        let netStr = '';
        if (netState?.type === 'wifi') {
          netStr = 'Wi-Fi';
          if (netState.details?.frequency) {
            const freq = netState.details.frequency;
            netStr += freq >= 4900 ? ' (5 GHz)' : ' (2.4 GHz)';
          }
          if (netState.details?.linkSpeed) {
            netStr += ` • ${netState.details.linkSpeed} Mbps`;
          }
        } else if (netState?.type === 'cellular') {
          const gen = netState.details?.cellularGeneration
            ? netState.details.cellularGeneration.toUpperCase()
            : 'Cellular';
          netStr = `Mobile (${gen})`;
        } else if (netState?.type === 'ethernet') {
          netStr = 'Ethernet';
        } else {
          netStr = 'Online';
        }
        this._networkInfo = netStr;
      } catch {
        this._networkInfo = 'Online';
      }
    } catch {
      // Safe guard against unexpected errors
    }
  }

  recordSample(sample: SessionStatsSample) {
    try {
      if (!this._isActive || !sample) return;

      const rtt = parseNumeric(sample.rtt);
      if (rtt !== null && rtt >= 0) this._rttSamples.push(rtt);

      const br = parseNumeric(sample.bitrate);
      if (br !== null && br > 0) this._bitrateSamples.push(br);

      const pl = parseNumeric(sample.packetLoss);
      if (pl !== null && pl >= 0) this._packetLossSamples.push(pl);

      const jit = parseNumeric(sample.jitter);
      if (jit !== null && jit >= 0) this._jitterSamples.push(jit);

      const fps = parseNumeric(sample.fps);
      if (fps !== null && fps > 0) this._fpsSamples.push(fps);

      const decode = parseNumeric(sample.decode);
      if (decode !== null && decode >= 0) this._decodeSamples.push(decode);

      if (typeof sample.bytesReceived === 'number' && sample.bytesReceived > this._maxBytesReceived) {
        this._maxBytesReceived = sample.bytesReceived;
      }
      if (typeof sample.bytesSent === 'number' && sample.bytesSent > this._maxBytesSent) {
        this._maxBytesSent = sample.bytesSent;
      }

      if (sample.resolution && typeof sample.resolution === 'string' && sample.resolution.toLowerCase().includes('x')) {
        this._resolution = sample.resolution.replace(/\s+/g, '').toLowerCase();
      } else if (sample.frameWidth && sample.frameHeight) {
        this._resolution = `${sample.frameWidth}x${sample.frameHeight}`;
      }

      if (sample.codec && typeof sample.codec === 'string') {
        this._codec = sample.codec.toUpperCase();
      }
    } catch {
      // Safe guard against unexpected sample formats
    }
  }

  finishSession(): SessionReportData | null {
    try {
      if (!this._isActive || this._sessionStartTime === 0) {
        return this._lastReport;
      }

    const durationSeconds = Math.max(1, Math.round((Date.now() - this._sessionStartTime) / 1000));
    this._isActive = false;

    // Minimum 5 seconds to produce a meaningful session report
    if (durationSeconds < 5) {
      return null;
    }

    const avg = (arr: number[], fallback: number = 0): number => {
      if (arr.length === 0) return fallback;
      const sum = arr.reduce((acc, curr) => acc + curr, 0);
      return sum / arr.length;
    };

    const max = (arr: number[], fallback: number = 0): number => {
      if (arr.length === 0) return fallback;
      return Math.max(...arr);
    };

    const latencyAvg = Math.round(avg(this._rttSamples, 45));
    const latencyPeak = Math.round(max(this._rttSamples, latencyAvg));

    const bitrateAvg = parseFloat(avg(this._bitrateSamples, 10).toFixed(1));
    const bitratePeak = parseFloat(max(this._bitrateSamples, bitrateAvg).toFixed(1));

    const packetLossAvg = parseFloat(avg(this._packetLossSamples, 0).toFixed(2));
    const packetLossPeak = parseFloat(max(this._packetLossSamples, packetLossAvg).toFixed(2));

    const jitterAvg = parseFloat(avg(this._jitterSamples, 1).toFixed(1));
    const jitterPeak = parseFloat(max(this._jitterSamples, jitterAvg).toFixed(1));

    const fpsAvg = parseFloat(avg(this._fpsSamples, 60).toFixed(1));
    const decodeAvg = parseFloat(avg(this._decodeSamples, 6).toFixed(1));
    const decodePeak = parseFloat(max(this._decodeSamples, decodeAvg).toFixed(1));

    // Total download & upload usage calculation
    let totalDownloadBytes = this._maxBytesReceived;
    let totalUploadBytes = this._maxBytesSent;

    // Fallback estimation if WebRTC byte counters weren't populated
    if (totalDownloadBytes <= 0 && bitrateAvg > 0) {
      totalDownloadBytes = Math.round((bitrateAvg * 1000000 / 8) * durationSeconds);
    }
    if (totalUploadBytes <= 0) {
      totalUploadBytes = Math.round(12 * 1024 * durationSeconds);
    }

    const totalDownloadFormatted = formatDataUsage(totalDownloadBytes);
    const totalUploadFormatted = formatDataUsage(totalUploadBytes);

    // Calculate quality score (0 - 100)
    let score = 100;

    // Latency penalty
    if (latencyAvg > 30) {
      score -= Math.min(30, (latencyAvg - 30) * 0.4);
    }
    // Packet loss penalty
    if (packetLossAvg > 0) {
      score -= Math.min(30, packetLossAvg * 15);
    }
    // Jitter penalty
    if (jitterAvg > 2) {
      score -= Math.min(15, (jitterAvg - 2) * 2);
    }
    // FPS penalty
    if (fpsAvg < 58) {
      score -= Math.min(15, (58 - fpsAvg) * 2.5);
    }
    // Decode time penalty
    if (decodeAvg > 12) {
      score -= Math.min(10, (decodeAvg - 12) * 1.5);
    }

    score = Math.max(10, Math.min(100, Math.round(score)));

    let qualityText: 'Excellent' | 'Good' | 'Fair' | 'Poor' = 'Excellent';
    let qualityColor = '#2ed573';

    if (score >= 90) {
      qualityText = 'Excellent';
      qualityColor = '#2ed573';
    } else if (score >= 75) {
      qualityText = 'Good';
      qualityColor = '#2ed573';
    } else if (score >= 60) {
      qualityText = 'Fair';
      qualityColor = '#ffa502';
    } else {
      qualityText = 'Poor';
      qualityColor = '#ff4757';
    }

    let packetLossStatus: 'Stable' | 'Moderate' | 'High' = 'Stable';
    if (packetLossAvg > 2) {
      packetLossStatus = 'High';
    } else if (packetLossAvg > 0.5) {
      packetLossStatus = 'Moderate';
    }

    const report: SessionReportData = {
      gameTitle: this._gameTitle,
      durationSeconds,
      durationFormatted: formatDuration(durationSeconds),
      score,
      qualityText,
      qualityColor,
      latencyAvg,
      latencyPeak,
      bitrateAvg,
      bitratePeak,
      packetLossAvg,
      packetLossPeak,
      packetLossStatus,
      jitterAvg,
      jitterPeak,
      fpsAvg,
      fpsTarget: 60,
      decodeAvg,
      decodePeak,
      resolution: this._resolution,
      codec: this._codec,
      networkInfo: this._networkInfo,
      totalDownloadBytes,
      totalUploadBytes,
      totalDownloadFormatted,
      totalUploadFormatted,
    };

    this._lastReport = report;
    return report;
  } catch {
    return null;
  }
}

  getReport(): SessionReportData | null {
    return this._lastReport;
  }

  clear() {
    this._isActive = false;
    this._sessionStartTime = 0;
    this._lastReport = null;
    this._rttSamples = [];
    this._bitrateSamples = [];
    this._packetLossSamples = [];
    this._jitterSamples = [];
    this._fpsSamples = [];
    this._decodeSamples = [];
    this._maxBytesReceived = 0;
    this._maxBytesSent = 0;
  }
}

export const sessionStatsTracker = new SessionStatsTracker();
export default sessionStatsTracker;
