import React from 'react';
import {View, StyleSheet} from 'react-native';
import Svg, {Circle, Path} from 'react-native-svg';

interface Props {
  size?: number;
  color?: string;
}

const XboxLogo: React.FC<Props> = ({size = 30, color = '#2ed573'}) => {
  return (
    <View style={styles.container}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {/* Background Sphere in Xbox Green */}
        <Circle cx="12" cy="12" r="11.5" fill={color} />
        {/* Iconic Xbox X Cutouts in Dark Background */}
        <Path
          fill="#0d1117"
          d="M12 5.86c1.657 0 3.206.46 4.54 1.258-1.226.79-2.73 1.282-4.54 1.282s-3.314-.492-4.54-1.282A8.52 8.52 0 0 1 12 5.86zm-5.61 2.87c.928 1.48 2.052 2.768 3.328 3.82-1.26 1.03-2.348 2.316-3.237 3.81A8.543 8.543 0 0 1 5.03 12c0-1.18.243-2.3.682-3.316.035.015.064.03.098.046h-.42zm11.22 0c.034-.016.063-.03.098-.046.439 1.016.682 2.136.682 3.316a8.543 8.543 0 0 1-1.45 4.684c-.89-1.494-1.977-2.78-3.237-3.81 1.276-1.052 2.4-2.34 3.328-3.82h-.42zm-5.61 6.55c1.47 0 2.766.36 3.882.975A8.526 8.526 0 0 1 12 18.14a8.526 8.526 0 0 1-3.882-1.895c1.116-.615 2.412-.975 3.882-.975z"
        />
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default React.memo(XboxLogo);
