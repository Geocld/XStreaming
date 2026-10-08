import {describe, expect, it} from '@jest/globals';
import {expandTeredoCandidates} from '../src/xCloud/teredoCandidates';

describe('expandTeredoCandidates', () => {
  it('adds XBXPlay Teredo IPv4 candidates and preserves the original candidate', () => {
    const sourceCandidate = {
      candidate:
        'a=candidate:1 1 UDP 16777215 2001:0000:4136:e378:8000:63bf:3fff:fdd2 50000 typ srflx',
      messageType: 'iceCandidate',
      sdpMLineIndex: '0',
      sdpMid: '0',
    };

    expect(expandTeredoCandidates([sourceCandidate])).toEqual([
      sourceCandidate,
      {
        candidate: 'a=candidate:2 1 UDP 100 192.0.2.45 40000 typ host ',
        messageType: 'iceCandidate',
        sdpMLineIndex: '0',
        sdpMid: '0',
      },
      {
        candidate: 'a=candidate:3 1 UDP 100 65.54.227.120 50000 typ host ',
        messageType: 'iceCandidate',
        sdpMLineIndex: '0',
        sdpMid: '0',
      },
      {
        candidate: 'a=candidate:4 1 UDP 100 192.0.2.45 50000 typ host ',
        messageType: 'iceCandidate',
        sdpMLineIndex: '0',
        sdpMid: '0',
      },
      {
        candidate: 'a=candidate:5 1 UDP 100 65.54.227.120 3074 typ host ',
        messageType: 'iceCandidate',
        sdpMLineIndex: '0',
        sdpMid: '0',
      },
      {
        candidate: 'a=candidate:6 1 UDP 100 192.0.2.45 3074 typ host ',
        messageType: 'iceCandidate',
        sdpMLineIndex: '0',
        sdpMid: '0',
      },
    ]);
  });

  it('does not add duplicate port 3074 candidates', () => {
    const sourceCandidate = {
      candidate:
        'candidate:1 1 UDP 16777215 2001:0000:4136:e378:8000:63bf:3fff:fdd2 3074 typ srflx',
    };

    const candidates = expandTeredoCandidates([sourceCandidate]);

    expect(candidates).toHaveLength(4);
    expect(candidates.map(({candidate}) => candidate)).toEqual([
      sourceCandidate.candidate,
      'a=candidate:2 1 UDP 100 192.0.2.45 40000 typ host ',
      'a=candidate:3 1 UDP 100 65.54.227.120 3074 typ host ',
      'a=candidate:4 1 UDP 100 192.0.2.45 3074 typ host ',
    ]);
  });

  it('leaves non-Teredo candidates untouched', () => {
    const candidates = [
      {
        candidate: 'a=candidate:1 1 UDP 16777215 2001:db8::1 50000 typ host',
      },
    ];

    expect(expandTeredoCandidates(candidates)).toEqual(candidates);
  });

  it('prioritizes IPv6 candidates without changing relative order or end marker', () => {
    const candidates = [
      {
        candidate: 'a=candidate:1 1 UDP 100 192.0.2.1 5000 typ host',
      },
      {
        candidate: 'a=candidate:2 1 UDP 100 2001:db8::1 5000 typ host',
      },
      {
        candidate: 'a=candidate:3 1 UDP 100 2001:db8::2 5001 typ host',
      },
      {
        candidate: 'a=candidate:4 1 UDP 100 192.0.2.2 5001 typ host',
      },
      {candidate: 'a=end-of-candidates'},
    ];

    expect(expandTeredoCandidates(candidates, true)).toEqual([
      candidates[1],
      candidates[2],
      candidates[0],
      candidates[3],
      candidates[4],
    ]);
  });
});
