import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Alert, Dimensions, Animated, Easing } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { ACHIEVEMENTS, ACHIEVEMENTS_STORAGE_KEY } from './achievements';
import AchievementsModal from './AchievementsModal';
import SettingsModal from './SettingsModal';

const GOLD = '#FBBF24';
const GOLDEN_GLOW = '#FDE68A';
const GRADIENT_COLORS = ['#1b0533', '#3b0764', '#6d28d9'];
const CARD_BG = 'rgba(255,255,255,0.08)';
const CARD_BORDER = 'rgba(255,255,255,0.16)';
const TEXT_SECONDARY = 'rgba(255,255,255,0.65)';

const LEVEL_SCORE_STEP = 10; // score needed per level
const DOUBLE_DURATION_MS = 6000;
const SLOW_DURATION_MS = 5000;
const TRAP_TIME_PENALTY = 3;
const TIME_BONUS = 5;
const GOLDEN_MULTIPLIER = 5;

const TILE_META = {
  time: { icon: 'time', color: '#34D399', label: '+5s' },
  double: { icon: 'flash', color: '#A78BFA', label: 'x2' },
  slow: { icon: 'hourglass-outline', color: '#38BDF8', label: 'slow' },
  trap: { icon: 'warning', color: '#F87171', label: '' },
};

const BURST_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315].map(d => (d * Math.PI) / 180);

const getGridSize = (diff) => {
  switch (diff) {
    case 'easy': return 9;   // 3x3
    case 'medium': return 16; // 4x4
    case 'hard': return 25;  // 5x5
    default: return 9;
  }
};

const getAppearanceInterval = (diff) => {
  switch (diff) {
    case 'easy': return 1000;   // 1 second
    case 'medium': return 700;  // 0.7 seconds
    case 'hard': return 400;    // 0.4 seconds
    default: return 700;
  }
};

const getInitialTime = (diff) => {
  switch (diff) {
    case 'easy': return 30;
    case 'medium': return 25;
    case 'hard': return 20;
    default: return 25;
  }
};

// Weighted random tile type. Trap odds creep up slightly with level to keep higher levels tense.
const pickTileType = (level) => {
  const trapWeight = Math.min(0.18, 0.05 + (level - 1) * 0.01);
  const goldenWeight = 0.05;
  const remaining = 1 - trapWeight - goldenWeight;
  const buckets = [
    ['snoop', remaining * 0.72],
    ['time', remaining * 0.12],
    ['double', remaining * 0.10],
    ['slow', remaining * 0.06],
    ['golden', goldenWeight],
    ['trap', trapWeight],
  ];
  const r = Math.random();
  let acc = 0;
  for (const [type, weight] of buckets) {
    acc += weight;
    if (r <= acc) return type;
  }
  return 'snoop';
};

// seekTo() resolves asynchronously; playing before it resolves is what causes the audio to stutter/skip.
const playSound = (player) => {
  player.seekTo(0).then(() => player.play()).catch(() => {});
};

function StatChip({ icon, label, value }) {
  return (
    <View style={styles.statChip}>
      <Ionicons name={icon} size={16} color={GOLD} />
      <Text style={styles.statChipValue}>{value}</Text>
      <Text style={styles.statChipLabel}>{label}</Text>
    </View>
  );
}

export default function App() {
  const [tileTypes, setTileTypes] = useState(Array(9).fill(null));
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(25);
  const [highScore, setHighScore] = useState(0);
  const [highestLevel, setHighestLevel] = useState(1);
  const [gameActive, setGameActive] = useState(true);
  const [paused, setPaused] = useState(false);
  const [difficulty, setDifficulty] = useState('medium'); // easy, medium, hard
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [doubleActive, setDoubleActive] = useState(false);
  const [slowActive, setSlowActive] = useState(false);
  const [unlockedAchievements, setUnlockedAchievements] = useState([]);
  const [achievementToast, setAchievementToast] = useState(null);
  const [showAchievementsModal, setShowAchievementsModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [scaleValues] = useState(() => Array.from({ length: 25 }, () => new Animated.Value(1))); // Max 5x5 grid
  const [appearValues] = useState(() => Array.from({ length: 25 }, () => new Animated.Value(0))); // Max 5x5 grid
  const [levelUpAnim] = useState(() => new Animated.Value(0));
  const [levelUpLabel, setLevelUpLabel] = useState(1);
  const [comboAnim] = useState(() => new Animated.Value(0));
  const [comboLabel, setComboLabel] = useState(0);
  const [achievementAnim] = useState(() => new Animated.Value(0));
  const [shakeAnim] = useState(() => new Animated.Value(0));
  const [goldenFlashAnim] = useState(() => new Animated.Value(0));
  const [burst, setBurst] = useState(null); // { index, color }
  const [burstAnim] = useState(() => new Animated.Value(0));

  const doubleTimeoutRef = useRef(null);
  const slowTimeoutRef = useRef(null);
  const achievementToastTimeoutRef = useRef(null);
  const prevLevelRef = useRef(1);
  const prevComboTierRef = useRef(0);
  const trapHitsRef = useRef(0);

  const tapPlayer = useAudioPlayer(require('./assets/sounds/tap.wav'));
  const gameOverPlayer = useAudioPlayer(require('./assets/sounds/gameover.wav'));
  const powerupPlayer = useAudioPlayer(require('./assets/sounds/powerup.wav'));
  const trapPlayer = useAudioPlayer(require('./assets/sounds/trap.wav'));
  const levelUpPlayer = useAudioPlayer(require('./assets/sounds/levelup.wav'));
  const goldenPlayer = useAudioPlayer(require('./assets/sounds/golden.wav'));
  const achievementPlayer = useAudioPlayer(require('./assets/sounds/achievement.wav'));
  const musicPlayer = useAudioPlayer(require('./assets/sounds/music.wav'));

  const playSfx = (player) => {
    if (soundEnabled) playSound(player);
  };

  const haptic = {
    impact: (style) => { if (hapticsEnabled) Haptics.impactAsync(style).catch(() => {}); },
    notify: (type) => { if (hapticsEnabled) Haptics.notificationAsync(type).catch(() => {}); },
    selection: () => { if (hapticsEnabled) Haptics.selectionAsync().catch(() => {}); },
  };

  const { width } = Dimensions.get('window');
  const gridSize = getGridSize(difficulty);
  const cols = Math.sqrt(gridSize);
  const tileSize = (width - 40) / cols; // Dynamic based on grid size, keeps grid square regardless of difficulty
  const level = Math.floor(score / LEVEL_SCORE_STEP) + 1;

  // Load persisted data on startup
  useEffect(() => {
    const loadStoredData = async () => {
      try {
        const storedScore = await AsyncStorage.getItem('highScore');
        if (storedScore !== null) {
          setHighScore(parseInt(storedScore, 10));
        }
        const storedAchievements = await AsyncStorage.getItem(ACHIEVEMENTS_STORAGE_KEY);
        if (storedAchievements !== null) {
          setUnlockedAchievements(JSON.parse(storedAchievements));
        }
        const storedHighestLevel = await AsyncStorage.getItem('highestLevel');
        if (storedHighestLevel !== null) {
          setHighestLevel(parseInt(storedHighestLevel, 10));
        }
        const storedSound = await AsyncStorage.getItem('soundEnabled');
        if (storedSound !== null) {
          setSoundEnabled(storedSound === 'true');
        }
        const storedHaptics = await AsyncStorage.getItem('hapticsEnabled');
        if (storedHaptics !== null) {
          setHapticsEnabled(storedHaptics === 'true');
        }
        const storedMusic = await AsyncStorage.getItem('musicEnabled');
        if (storedMusic !== null) {
          setMusicEnabled(storedMusic === 'true');
        }
      } catch (error) {
        console.warn('Failed to load stored data:', error);
      }
    };

    loadStoredData();
  }, []);

  // Save high score when game ends
  useEffect(() => {
    if (!gameActive && score > highScore) {
      setHighScore(score);
      AsyncStorage.setItem('highScore', score.toString()).catch(error =>
        console.warn('Failed to save high score:', error)
      );
    }
  }, [gameActive, score, highScore]);

  const unlockAchievement = (id) => {
    if (unlockedAchievements.includes(id)) return;
    setUnlockedAchievements(prev => {
      if (prev.includes(id)) return prev;
      const updated = [...prev, id];
      AsyncStorage.setItem(ACHIEVEMENTS_STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });

    const def = ACHIEVEMENTS.find(a => a.id === id);
    if (!def) return;
    setAchievementToast(def);
    playSfx(achievementPlayer);
    haptic.notify(Haptics.NotificationFeedbackType.Success);
    clearTimeout(achievementToastTimeoutRef.current);
    achievementToastTimeoutRef.current = setTimeout(() => setAchievementToast(null), 2200);
    Animated.sequence([
      Animated.timing(achievementAnim, { toValue: 1, duration: 250, useNativeDriver: false }),
      Animated.delay(1600),
      Animated.timing(achievementAnim, { toValue: 0, duration: 350, useNativeDriver: false }),
    ]).start();
  };

  // Background music: plays while a round is active and unpaused
  useEffect(() => {
    if (gameActive && !paused && musicEnabled) {
      musicPlayer.loop = true;
      musicPlayer.volume = 0.35;
      musicPlayer.play();
    } else {
      musicPlayer.pause();
    }
  }, [gameActive, paused, musicEnabled]);

  useEffect(() => {
    return () => musicPlayer.pause();
  }, []);

  const triggerShake = () => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 1, duration: 45, useNativeDriver: false }),
      Animated.timing(shakeAnim, { toValue: -1, duration: 45, useNativeDriver: false }),
      Animated.timing(shakeAnim, { toValue: 1, duration: 45, useNativeDriver: false }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 45, useNativeDriver: false }),
    ]).start();
  };

  const triggerBurst = (index, color) => {
    setBurst({ index, color });
    burstAnim.setValue(0);
    Animated.timing(burstAnim, { toValue: 1, duration: 500, useNativeDriver: false }).start(() => {
      setBurst(null);
    });
  };

  // Game timer
  useEffect(() => {
    if (gameActive && !paused && timeLeft > 0) {
      const timer = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
      return () => clearInterval(timer);
    }

    if (timeLeft === 0 && gameActive) {
      setGameActive(false);
      playSfx(gameOverPlayer);
      haptic.notify(Haptics.NotificationFeedbackType.Warning);
      if (difficulty === 'hard' && score > 0) unlockAchievement('hard_clear');
      if (trapHitsRef.current === 0 && score > 0) unlockAchievement('no_traps');
      Alert.alert(
        "Time's Out",
        "Do you want to play again?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Play Again",
            onPress: () => resetGame()
          }
        ]
      );
    }
  }, [gameActive, paused, timeLeft]);

  // Level-up banner + haptic/sound whenever the derived level increases
  useEffect(() => {
    if (level > prevLevelRef.current) {
      prevLevelRef.current = level;
      setLevelUpLabel(level);
      playSfx(levelUpPlayer);
      haptic.notify(Haptics.NotificationFeedbackType.Success);
      Animated.sequence([
        Animated.timing(levelUpAnim, { toValue: 1, duration: 200, useNativeDriver: false }),
        Animated.delay(900),
        Animated.timing(levelUpAnim, { toValue: 0, duration: 300, useNativeDriver: false }),
      ]).start();
      triggerShake();
      if (level >= 5) unlockAchievement('level_5');
      if (level > highestLevel) {
        setHighestLevel(level);
        AsyncStorage.setItem('highestLevel', level.toString()).catch(() => {});
      }
    } else {
      prevLevelRef.current = level;
    }
  }, [level]);

  // Snoop / power-up appearance timer
  useEffect(() => {
    if (gameActive && !paused) {
      const speedFactor = Math.max(0.55, 1 - (level - 1) * 0.06);
      const interval = getAppearanceInterval(difficulty) * speedFactor * (slowActive ? 1.6 : 1);
      const timer = setInterval(() => {
        // Hide all tiles and reset their appearance animations
        setTileTypes(Array(gridSize).fill(null));
        appearValues.slice(0, gridSize).forEach(anim => {
          anim.setValue(0);
          Animated.timing(anim, {
            toValue: 1,
            duration: 300,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false
          }).start();
        });

        // Show a random tile (snoop or power-up)
        const randomIndex = Math.floor(Math.random() * gridSize);
        setTileTypes(prev => {
          const newState = [...prev];
          newState[randomIndex] = pickTileType(level);
          return newState;
        });
      }, interval);

      return () => clearInterval(timer);
    }
  }, [gameActive, paused, appearValues, difficulty, gridSize, level, slowActive]);

  const triggerComboBanner = (newStreak) => {
    const newTier = Math.floor(newStreak / 5);
    if (newTier > prevComboTierRef.current && newTier > 0) {
      prevComboTierRef.current = newTier;
      setComboLabel(newStreak);
      Animated.sequence([
        Animated.timing(comboAnim, { toValue: 1, duration: 150, useNativeDriver: false }),
        Animated.delay(700),
        Animated.timing(comboAnim, { toValue: 0, duration: 250, useNativeDriver: false }),
      ]).start();
    } else {
      prevComboTierRef.current = newTier;
    }
  };

  const handleTilePress = (index) => {
    const type = tileTypes[index];
    if (!gameActive || paused || !type) return;

    // Trigger tap animation (shared by every tile type)
    Animated.sequence([
      Animated.timing(scaleValues[index], { toValue: 0.8, duration: 50, useNativeDriver: false }),
      Animated.timing(scaleValues[index], { toValue: 1.2, duration: 50, useNativeDriver: false }),
      Animated.timing(scaleValues[index], { toValue: 1, duration: 100, useNativeDriver: false })
    ]).start();

    if (type === 'snoop' || type === 'golden') {
      const basePoints = (1 + Math.floor(streak / 5)) * (type === 'golden' ? GOLDEN_MULTIPLIER : 1);
      const points = doubleActive ? basePoints * 2 : basePoints;
      const newScore = score + points;
      const newStreak = streak + 1;
      setScore(newScore);
      setStreak(newStreak);
      setMaxStreak(prev => Math.max(prev, newStreak));

      if (type === 'golden') {
        playSfx(goldenPlayer);
        haptic.notify(Haptics.NotificationFeedbackType.Success);
        unlockAchievement('golden_catch');
        triggerBurst(index, GOLDEN_GLOW);
        Animated.sequence([
          Animated.timing(goldenFlashAnim, { toValue: 0.5, duration: 80, useNativeDriver: false }),
          Animated.timing(goldenFlashAnim, { toValue: 0, duration: 220, useNativeDriver: false }),
        ]).start();
      } else {
        playSfx(tapPlayer);
        haptic.impact(Haptics.ImpactFeedbackStyle.Light);
        triggerBurst(index, GOLD);
      }

      unlockAchievement('first_catch');
      if (newScore >= 10) unlockAchievement('score_10');
      if (newScore >= 50) unlockAchievement('score_50');
      if (newScore >= 100) unlockAchievement('score_100');
      if (newStreak >= 10) unlockAchievement('streak_10');
      triggerComboBanner(newStreak);
    } else if (type === 'time') {
      setTimeLeft(prev => prev + TIME_BONUS);
      playSfx(powerupPlayer);
      haptic.notify(Haptics.NotificationFeedbackType.Success);
      triggerBurst(index, TILE_META.time.color);
    } else if (type === 'double') {
      setDoubleActive(true);
      clearTimeout(doubleTimeoutRef.current);
      doubleTimeoutRef.current = setTimeout(() => setDoubleActive(false), DOUBLE_DURATION_MS);
      playSfx(powerupPlayer);
      haptic.notify(Haptics.NotificationFeedbackType.Success);
      triggerBurst(index, TILE_META.double.color);
    } else if (type === 'slow') {
      setSlowActive(true);
      clearTimeout(slowTimeoutRef.current);
      slowTimeoutRef.current = setTimeout(() => setSlowActive(false), SLOW_DURATION_MS);
      playSfx(powerupPlayer);
      haptic.notify(Haptics.NotificationFeedbackType.Success);
      triggerBurst(index, TILE_META.slow.color);
    } else if (type === 'trap') {
      setTimeLeft(prev => Math.max(0, prev - TRAP_TIME_PENALTY));
      setStreak(0);
      prevComboTierRef.current = 0;
      trapHitsRef.current += 1;
      playSfx(trapPlayer);
      haptic.notify(Haptics.NotificationFeedbackType.Error);
      triggerBurst(index, TILE_META.trap.color);
      triggerShake();
    }

    // Hide the tapped tile; the periodic spawn timer brings up the next target.
    // (Spawning a replacement here too, independently of that timer, was the bug --
    // the two could both add a tile around the same moment and show two at once.)
    setTileTypes(prev => {
      const newState = [...prev];
      newState[index] = null;
      return newState;
    });
  };

  const togglePause = () => {
    haptic.selection();
    setPaused(prev => !prev);
  };

  const toggleSound = (value) => {
    setSoundEnabled(value);
    AsyncStorage.setItem('soundEnabled', value.toString()).catch(() => {});
  };

  const toggleHaptics = (value) => {
    setHapticsEnabled(value);
    AsyncStorage.setItem('hapticsEnabled', value.toString()).catch(() => {});
  };

  const toggleMusic = (value) => {
    setMusicEnabled(value);
    AsyncStorage.setItem('musicEnabled', value.toString()).catch(() => {});
  };

  const handleResetProgress = () => {
    Alert.alert(
      'Reset Progress',
      'This will erase your high score, best level, and achievements. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            setHighScore(0);
            setHighestLevel(1);
            setUnlockedAchievements([]);
            AsyncStorage.multiRemove(['highScore', 'highestLevel', ACHIEVEMENTS_STORAGE_KEY]).catch(() => {});
          }
        }
      ]
    );
  };

  const resetGame = () => {
    setScore(0);
    setTimeLeft(getInitialTime(difficulty));
    setTileTypes(Array(gridSize).fill(null));
    setGameActive(true);
    setPaused(false);
    setStreak(0);
    setDoubleActive(false);
    setSlowActive(false);
    clearTimeout(doubleTimeoutRef.current);
    clearTimeout(slowTimeoutRef.current);
    prevLevelRef.current = 1;
    prevComboTierRef.current = 0;
    trapHitsRef.current = 0;
    // Reset animations
    scaleValues.forEach(anim => anim.setValue(1));
    appearValues.forEach(anim => anim.setValue(0));
    levelUpAnim.setValue(0);
    comboAnim.setValue(0);
    shakeAnim.setValue(0);
    goldenFlashAnim.setValue(0);
    setBurst(null);
  };

  // Clear pending power-up timers on unmount
  useEffect(() => {
    return () => {
      clearTimeout(doubleTimeoutRef.current);
      clearTimeout(slowTimeoutRef.current);
      clearTimeout(achievementToastTimeoutRef.current);
    };
  }, []);

  const comboBonus = Math.floor(streak / 5);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <LinearGradient colors={GRADIENT_COLORS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.flexFull}>
        <SafeAreaView style={styles.flexFull} edges={['top', 'bottom']}>
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFillObject, { backgroundColor: GOLDEN_GLOW, opacity: goldenFlashAnim, zIndex: 30 }]}
          />

          <Animated.View
            pointerEvents="none"
            style={[
              styles.achievementToast,
              {
                opacity: achievementAnim,
                transform: [{ translateY: achievementAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }]
              }
            ]}
          >
            <Ionicons name="trophy" size={20} color={GOLD} />
            <View style={{ marginLeft: 8 }}>
              <Text style={styles.achievementToastTitle}>Achievement Unlocked!</Text>
              <Text style={styles.achievementToastDesc}>{achievementToast ? achievementToast.title : ''}</Text>
            </View>
          </Animated.View>

          {gameActive ? (
            <Animated.View
              style={[
                styles.container,
                { transform: [{ translateX: shakeAnim.interpolate({ inputRange: [-1, 1], outputRange: [-6, 6] }) }] }
              ]}
            >
              <View style={styles.header}>
                <TouchableOpacity
                  style={styles.settingsButton}
                  onPress={() => setShowSettingsModal(true)}
                >
                  <Ionicons name="settings-outline" size={20} color={GOLD} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.achievementsButton}
                  onPress={() => setShowAchievementsModal(true)}
                >
                  <Ionicons name="trophy-outline" size={20} color={GOLD} />
                  {unlockedAchievements.length > 0 && (
                    <View style={styles.achievementsBadge}>
                      <Text style={styles.achievementsBadgeText}>{unlockedAchievements.length}</Text>
                    </View>
                  )}
                </TouchableOpacity>
                <Text style={styles.headerTitle}>🕵️ Catch the Snoop</Text>
                <View style={styles.levelBadge}>
                  <Ionicons name="trending-up" size={13} color={GOLD} />
                  <Text style={styles.levelBadgeText}>
                    Level {level}{highestLevel > 1 ? `  ·  Best Lv ${highestLevel}` : ''}
                  </Text>
                </View>
              </View>

              <View style={styles.statsRow}>
                <StatChip icon="time-outline" label="Time" value={timeLeft} />
                <StatChip icon="star" label="Score" value={score} />
                <StatChip icon="trophy" label="Best" value={highScore} />
                <StatChip icon="flame" label="Streak" value={comboBonus > 0 ? `${streak} (+${comboBonus})` : streak} />
                <TouchableOpacity style={styles.pauseButton} onPress={togglePause}>
                  <Ionicons name={paused ? 'play' : 'pause'} size={18} color={GOLD} />
                </TouchableOpacity>
              </View>

              {(doubleActive || slowActive) && (
                <View style={styles.activeEffectsRow}>
                  {doubleActive && (
                    <View style={[styles.effectBadge, { borderColor: TILE_META.double.color }]}>
                      <Ionicons name="flash" size={13} color={TILE_META.double.color} />
                      <Text style={[styles.effectBadgeText, { color: TILE_META.double.color }]}>x2 Score</Text>
                    </View>
                  )}
                  {slowActive && (
                    <View style={[styles.effectBadge, { borderColor: TILE_META.slow.color }]}>
                      <Ionicons name="hourglass-outline" size={13} color={TILE_META.slow.color} />
                      <Text style={[styles.effectBadgeText, { color: TILE_META.slow.color }]}>Slow-Mo</Text>
                    </View>
                  )}
                </View>
              )}

              <View style={styles.difficultySelector}>
                {['easy', 'medium', 'hard'].map(diffKey => (
                  <TouchableOpacity
                    key={diffKey}
                    style={[styles.difficultyButton, difficulty === diffKey && styles.difficultyButtonActive]}
                    onPress={() => {
                      haptic.selection();
                      setDifficulty(diffKey);
                    }}
                  >
                    <Text style={[styles.difficultyText, difficulty === diffKey && styles.difficultyTextActive]}>
                      {diffKey.charAt(0).toUpperCase() + diffKey.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.snoopGrid}>
                {tileTypes.map((type, index) => (
                  <TouchableOpacity
                    key={index}
                    activeOpacity={0.7}
                    onPress={() => handleTilePress(index)}
                    style={[styles.snoopContainer, { width: tileSize, height: tileSize }]}
                  >
                    {type === 'snoop' || type === 'golden' ? (
                      <Animated.View style={[
                        styles.snoopImageWrapper,
                        type === 'golden' && styles.snoopImageWrapperGolden,
                        {
                          transform: [{ scale: scaleValues[index] }],
                          opacity: appearValues[index]
                        }
                      ]}>
                        <Image
                          source={require('./assets/snoop.png')}
                          style={styles.snoopImage}
                          resizeMode="contain"
                        />
                        {type === 'golden' && (
                          <View style={styles.goldenLabelWrap}>
                            <Text style={styles.goldenLabel}>x{GOLDEN_MULTIPLIER}</Text>
                          </View>
                        )}
                      </Animated.View>
                    ) : type ? (
                      <Animated.View style={[
                        styles.powerupWrapper,
                        {
                          borderColor: TILE_META[type].color,
                          shadowColor: TILE_META[type].color,
                          transform: [{ scale: scaleValues[index] }],
                          opacity: appearValues[index]
                        }
                      ]}>
                        <Ionicons name={TILE_META[type].icon} size={24} color={TILE_META[type].color} />
                        {!!TILE_META[type].label && (
                          <Text style={[styles.powerupLabel, { color: TILE_META[type].color }]}>
                            {TILE_META[type].label}
                          </Text>
                        )}
                      </Animated.View>
                    ) : (
                      <View style={styles.snoopHidden}>
                        <Ionicons name="help-circle-outline" size={20} color="rgba(255,255,255,0.2)" />
                      </View>
                    )}

                    {burst && burst.index === index && (
                      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
                        {BURST_ANGLES.map((angle, i) => (
                          <Animated.View
                            key={i}
                            style={[
                              styles.burstDot,
                              {
                                backgroundColor: burst.color,
                                opacity: burstAnim.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1, 1, 0] }),
                                transform: [
                                  { translateX: burstAnim.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * (tileSize * 0.5)] }) },
                                  { translateY: burstAnim.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * (tileSize * 0.5)] }) },
                                  { scale: burstAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.2] }) },
                                ]
                              }
                            ]}
                          />
                        ))}
                      </View>
                    )}
                  </TouchableOpacity>
                ))}

                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.comboBanner,
                    {
                      opacity: comboAnim,
                      transform: [{ scale: comboAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }]
                    }
                  ]}
                >
                  <Ionicons name="flame" size={16} color="#1b0533" />
                  <Text style={styles.comboText}>{comboLabel} STREAK COMBO!</Text>
                </Animated.View>

                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.levelUpBanner,
                    {
                      opacity: levelUpAnim,
                      transform: [{ scale: levelUpAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }]
                    }
                  ]}
                >
                  <Ionicons name="ribbon" size={20} color="#1b0533" />
                  <Text style={styles.levelUpText}>LEVEL {levelUpLabel}!</Text>
                </Animated.View>

                {paused && (
                  <View style={styles.pauseOverlay}>
                    <Ionicons name="pause-circle" size={56} color={GOLD} />
                    <Text style={styles.pauseOverlayText}>Paused</Text>
                    <TouchableOpacity style={styles.resumeButton} onPress={togglePause}>
                      <Ionicons name="play" size={16} color="#1b0533" />
                      <Text style={styles.resumeButtonText}>Resume</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </Animated.View>
          ) : (
            <View style={styles.gameOverWrap}>
              <View style={styles.gameOverCard}>
                <Ionicons name="trophy" size={56} color={GOLD} />
                <Text style={styles.gameOverTitle}>Time's Up!</Text>
                <Image
                  source={require('./assets/snoop.png')}
                  style={styles.gameOverImage}
                  resizeMode="contain"
                />
                <View style={styles.gameOverStatsRow}>
                  <StatChip icon="star" label="Score" value={score} />
                  <StatChip icon="trophy" label="Best" value={highScore} />
                  <StatChip icon="flame" label="Max Streak" value={maxStreak} />
                </View>
                <TouchableOpacity
                  style={styles.button}
                  onPress={() => {
                    haptic.impact(Haptics.ImpactFeedbackStyle.Medium);
                    resetGame();
                  }}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={[GOLD, '#F59E0B']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.buttonGradient}
                  >
                    <Ionicons name="play" size={18} color="#1b0533" />
                    <Text style={styles.buttonText}>Play Again</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <AchievementsModal
            visible={showAchievementsModal}
            onClose={() => setShowAchievementsModal(false)}
            achievements={ACHIEVEMENTS}
            unlockedIds={unlockedAchievements}
          />

          <SettingsModal
            visible={showSettingsModal}
            onClose={() => setShowSettingsModal(false)}
            soundEnabled={soundEnabled}
            hapticsEnabled={hapticsEnabled}
            musicEnabled={musicEnabled}
            onToggleSound={toggleSound}
            onToggleHaptics={toggleHaptics}
            onToggleMusic={toggleMusic}
            onResetProgress={handleResetProgress}
          />
        </SafeAreaView>
      </LinearGradient>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  flexFull: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  header: {
    alignItems: 'center',
    marginBottom: 16,
    position: 'relative',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  settingsButton: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 12,
    padding: 8,
  },
  achievementsButton: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 12,
    padding: 8,
  },
  achievementsBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#F87171',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  achievementsBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#ffffff',
  },
  levelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 12,
    paddingVertical: 3,
    paddingHorizontal: 10,
    marginTop: 6,
  },
  levelBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: GOLD,
    marginLeft: 4,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: 10,
  },
  statChip: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 14,
    paddingVertical: 8,
    marginHorizontal: 3,
  },
  statChipValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
    marginTop: 2,
  },
  statChipLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: TEXT_SECONDARY,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 1,
  },
  pauseButton: {
    width: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 14,
    marginLeft: 3,
  },
  activeEffectsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 10,
  },
  effectBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginHorizontal: 4,
  },
  effectBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 4,
  },
  difficultySelector: {
    flexDirection: 'row',
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 16,
    padding: 4,
    marginBottom: 18,
  },
  difficultyButton: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 12,
    alignItems: 'center',
  },
  difficultyButtonActive: {
    backgroundColor: GOLD,
  },
  difficultyText: {
    color: TEXT_SECONDARY,
    fontWeight: '700',
    fontSize: 13,
  },
  difficultyTextActive: {
    color: '#1b0533',
  },
  snoopGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignContent: 'flex-start',
  },
  snoopContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  snoopImageWrapper: {
    width: '78%',
    height: '78%',
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 2,
    borderColor: GOLD,
    shadowColor: GOLD,
    shadowOpacity: 0.6,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  snoopImageWrapperGolden: {
    borderWidth: 3,
    borderColor: GOLDEN_GLOW,
    shadowColor: GOLDEN_GLOW,
    shadowOpacity: 0.95,
    shadowRadius: 16,
  },
  snoopImage: {
    width: '100%',
    height: '100%',
  },
  goldenLabelWrap: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: GOLDEN_GLOW,
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  goldenLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1b0533',
  },
  powerupWrapper: {
    width: '78%',
    height: '78%',
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 2,
    shadowOpacity: 0.6,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    justifyContent: 'center',
    alignItems: 'center',
  },
  powerupLabel: {
    fontSize: 10,
    fontWeight: '800',
    marginTop: 2,
  },
  snoopHidden: {
    width: '78%',
    height: '78%',
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  burstDot: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 8,
    height: 8,
    marginLeft: -4,
    marginTop: -4,
    borderRadius: 4,
  },
  comboBanner: {
    position: 'absolute',
    top: '22%',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FDE68A',
    borderRadius: 18,
    paddingVertical: 8,
    paddingHorizontal: 16,
    shadowColor: '#FDE68A',
    shadowOpacity: 0.8,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  comboText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1b0533',
    marginLeft: 6,
  },
  levelUpBanner: {
    position: 'absolute',
    top: '40%',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: GOLD,
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
    shadowColor: GOLD,
    shadowOpacity: 0.8,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  levelUpText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1b0533',
    marginLeft: 6,
  },
  pauseOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,4,31,0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
  },
  pauseOverlayText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ffffff',
    marginTop: 8,
    marginBottom: 16,
  },
  resumeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: GOLD,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  resumeButtonText: {
    color: '#1b0533',
    fontSize: 14,
    fontWeight: '800',
    marginLeft: 6,
  },
  achievementToast: {
    position: 'absolute',
    top: 8,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(27,5,51,0.95)',
    borderWidth: 1,
    borderColor: GOLD,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    zIndex: 20,
  },
  achievementToastTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: TEXT_SECONDARY,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  achievementToastDesc: {
    fontSize: 14,
    fontWeight: '800',
    color: '#ffffff',
    marginTop: 1,
  },
  gameOverWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  gameOverCard: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 28,
    padding: 28,
  },
  gameOverTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#ffffff',
    marginTop: 10,
    marginBottom: 18,
  },
  gameOverImage: {
    width: 110,
    height: 110,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginBottom: 20,
  },
  gameOverStatsRow: {
    flexDirection: 'row',
    width: '100%',
    marginBottom: 24,
  },
  button: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  buttonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  buttonText: {
    color: '#1b0533',
    fontSize: 17,
    fontWeight: '800',
    marginLeft: 8,
  },
});
