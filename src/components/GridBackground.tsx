import React from 'react';
import {View, StyleSheet, Dimensions} from 'react-native';

const GridBackground = ({
  gridSize = 20,
  gridColor = 'rgba(200, 200, 200, 0.2)',
}) => {
  const {width, height} = Dimensions.get('window');

  // Calculate number of lines needed
  const horizontalLines = Math.floor(height / gridSize) * 2;
  const verticalLines = Math.floor(width / gridSize) * 2;

  return (
    <View style={styles.container}>
      {/* Horizontal lines */}
      {Array.from({length: horizontalLines}).map((_, index) => (
        <View
          key={`h-${index}`}
          style={[
            styles.horizontalLine,
            {top: index * gridSize, borderColor: gridColor},
          ]}
        />
      ))}

      {/* Vertical lines */}
      {Array.from({length: verticalLines}).map((_, index) => (
        <View
          key={`v-${index}`}
          style={[
            styles.verticalLine,
            {left: index * gridSize, borderColor: gridColor},
          ]}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
  },
  horizontalLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    borderBottomWidth: 1,
  },
  verticalLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    borderRightWidth: 1,
  },
});

export default GridBackground;
