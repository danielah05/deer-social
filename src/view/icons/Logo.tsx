import React from 'react'
import {type TextProps} from 'react-native'
import Svg, {
  Defs,
  LinearGradient,
  Path,
  type PathProps,
  Stop,
  type SvgProps,
} from 'react-native-svg'

import {colors} from '#/lib/styles'
//import {useKawaiiMode} from '#/state/preferences/kawaii'
import {flatten} from '#/alf'

const ratio = 512 / 512

type Props = {
  fill?: PathProps['fill']
  style?: TextProps['style']
} & Omit<SvgProps, 'style'>

export const Logo = React.forwardRef(function LogoImpl(props: Props, ref) {
  const {fill, ...rest} = props
  const gradient = fill === 'sky'
  const styles = flatten(props.style)
  const _fill = gradient ? 'url(#sky)' : fill || styles?.color || colors.blue3
  // @ts-ignore it's fiiiiine
  const size = parseInt(rest.width || 32)

  // const isKawaii = useKawaiiMode()

  // if (isKawaii) {
  //   return (
  //     <Image
  //       source={
  //         size > 100
  //           ? require('../../../assets/kawaii.png')
  //           : require('../../../assets/kawaii_smol.png')
  //       }
  //       accessibilityLabel="Bluesky"
  //       accessibilityHint=""
  //       accessibilityIgnoresInvertColors
  //       style={[{height: size, aspectRatio: 1.4}]}
  //     />
  //   )
  // }

  return (
    <Svg
      fill="none"
      // @ts-ignore it's fiiiiine
      ref={ref}
      viewBox="0 0 512 512"
      {...rest}
      style={[{width: size, height: size * ratio}, styles]}>
      {gradient && (
        <Defs>
          <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#ac6eba" stopOpacity="1" />
            <Stop offset="1" stopColor="#52255a" stopOpacity="1" />
          </LinearGradient>
        </Defs>
      )}

      <Path
        fill={_fill}
        d="M 139.50701,481.46177 C 110.39999,468.98173 86.533909,453.54301 61.964889,419.83625 35.897219,370.0465 34.984399,357.14316 42.943909,287.92538 c 4.25704,-24.47925 8.93891,-48.91985 14.99078,-67.1812 4.88493,-65.3163 9.58428,-144.66185 32.87413,-206.38418 53.194811,26.79973 91.543811,80.59203 115.523451,115.30575 16.14256,-5.59414 32.02746,-6.33869 49.66773,-6.95446 17.64026,0.61577 33.52516,1.36032 49.66773,6.95446 C 329.64737,94.95203 367.99636,41.15973 421.19118,14.36 c 23.28985,61.72233 27.9892,141.06788 32.87413,206.38418 6.05186,18.26135 10.73373,42.70195 14.99078,67.1812 7.95951,69.21778 7.04669,82.12112 -19.02098,131.91087 C 425.46609,453.54301 401.6,468.98173 372.49299,481.46177 332.99611,493.55441 295.84063,495.51025 256,497.64 216.15936,495.51025 179.00389,493.55441 139.50701,481.46177 Z"
        transform="matrix(1.0,0,0,1.0,7.744879,-0.90966)"
      />
    </Svg>
  )
})
