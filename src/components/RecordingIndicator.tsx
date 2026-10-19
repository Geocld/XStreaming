import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

interface RecordingIndicatorProps {
  visible: boolean;
}

const formatTimer = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const RecordingIndicator: React.FC<RecordingIndicatorProps> = ({visible}) => {
  const [elapsed, setElapsed] = React.useState(0);

  React.useEffect(() => {
    if (!visible) {
      setElapsed(0);
      return;
    }

    const timer = setInterval(() => {
      setElapsed(prev => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [visible]);

  if (!visible) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.dot} />
      <Text style={styles.text}>REC {formatTimer(elapsed)}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 14,
    right: 16,
    zIndex: 999,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 68, 68, 0.4)',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ff4444',
    marginRight: 6,
  },
  text: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

export default RecordingIndicator;
