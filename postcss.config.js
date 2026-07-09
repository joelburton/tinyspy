// PostCSS config — picked up automatically by Vite for every CSS file it
// processes (global stylesheets AND *.module.css).
//
// We use it for ONE thing: shared responsive breakpoints. CSS custom properties
// can't be used inside `@media` conditions (they're evaluated before the
// cascade), and several of our device classes are compound conditions
// (width + orientation/height), not single thresholds — so a plain `var()`
// can't express them. `@custom-media` names each condition once; every module
// then writes `@media (--phone) { … }` instead of re-typing the raw query.
//
// The definitions live in one file (src/common/breakpoints.css); global-data
// injects them into every processed file so custom-media can resolve them
// cross-module. Order matters: global-data must run before custom-media.
// See docs/mobile.md → "Naming the device classes".
import globalData from '@csstools/postcss-global-data'
import customMedia from 'postcss-custom-media'

export default {
  plugins: [
    globalData({ files: ['src/common/breakpoints.css'] }),
    customMedia(),
  ],
}
