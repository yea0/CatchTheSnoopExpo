# 🕵️ Catch the Snoop

A whack-a-mole style mobile game built with [Expo](https://expo.dev) / React Native. Tap the Snoop before he vanishes, grab power-ups, dodge traps, and climb the levels.

<p align="center">
  <img src="./assets/icon.png" width="160" alt="Catch the Snoop app icon" />
</p>

## Gameplay

- **Difficulty modes** — Easy (3×3), Medium (4×4), Hard (5×5) grids
- **Endless level system** — every 10 points levels you up, spawn speed ramps up with each level
- **Power-ups** — ⏱️ +5s time bonus, ⚡ x2 score, 🐌 slow-mo, 🌟 Golden Snoop (5x points)
- **Trap tiles** — a decoy that costs you time and breaks your combo streak
- **Combo streaks** — chain catches for bonus points, with an on-screen combo callout
- **Achievements** — 9 unlockable achievements tracked across sessions
- **Settings** — toggle background music, sound effects, and haptic feedback independently
- **Pause** — freeze the round any time

## Tech stack

- [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/)
- React Native + `react-native-web`
- `expo-audio` for sound/music playback
- `expo-haptics` for tactile feedback
- `expo-linear-gradient`, `@expo/vector-icons`
- `@react-native-async-storage/async-storage` for persisted progress
- `expo-splash-screen` for the native splash screen

All sound effects and the background music loop are procedurally synthesized (no external audio assets).

## Getting started

```bash
npm install
npx expo start
```

Scan the QR code with **Expo Go** (Android/iOS), or press `w` to run it in a browser.

## Building a standalone app

This project is configured for [EAS Build](https://docs.expo.dev/build/introduction/):

```bash
npx eas-cli build --platform android --profile preview
```

## Project structure

```
App.js                 Main game screen and logic
achievements.js        Achievement definitions
AchievementsModal.js   Achievements list modal
SettingsModal.js       Settings modal (sound/music/haptics/reset)
assets/                Icons, splash screen, and generated sound effects
```

## License

MIT
