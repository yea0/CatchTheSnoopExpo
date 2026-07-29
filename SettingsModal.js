import React from 'react';
import { View, Text, TouchableOpacity, Modal, Switch, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const GOLD = '#FBBF24';
const CARD_BG = 'rgba(255,255,255,0.08)';
const CARD_BORDER = 'rgba(255,255,255,0.16)';

export default function SettingsModal({
  visible,
  onClose,
  soundEnabled,
  hapticsEnabled,
  musicEnabled,
  onToggleSound,
  onToggleHaptics,
  onToggleMusic,
  onResetProgress,
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Settings</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color="#ffffff" />
            </TouchableOpacity>
          </View>

          <View style={styles.row}>
            <Ionicons name="musical-notes" size={20} color={GOLD} />
            <Text style={styles.rowLabel}>Background Music</Text>
            <Switch
              value={musicEnabled}
              onValueChange={onToggleMusic}
              trackColor={{ false: 'rgba(255,255,255,0.2)', true: GOLD }}
              thumbColor="#ffffff"
            />
          </View>

          <View style={styles.row}>
            <Ionicons name={soundEnabled ? 'volume-high' : 'volume-mute'} size={20} color={GOLD} />
            <Text style={styles.rowLabel}>Sound Effects</Text>
            <Switch
              value={soundEnabled}
              onValueChange={onToggleSound}
              trackColor={{ false: 'rgba(255,255,255,0.2)', true: GOLD }}
              thumbColor="#ffffff"
            />
          </View>

          <View style={styles.row}>
            <Ionicons name="phone-portrait-outline" size={20} color={GOLD} />
            <Text style={styles.rowLabel}>Haptic Feedback</Text>
            <Switch
              value={hapticsEnabled}
              onValueChange={onToggleHaptics}
              trackColor={{ false: 'rgba(255,255,255,0.2)', true: GOLD }}
              thumbColor="#ffffff"
            />
          </View>

          <TouchableOpacity style={styles.resetButton} onPress={onResetProgress}>
            <Ionicons name="trash-outline" size={16} color="#F87171" />
            <Text style={styles.resetButtonText}>Reset Progress</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    backgroundColor: '#2a0a4d',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ffffff',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  rowLabel: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    paddingVertical: 10,
  },
  resetButtonText: {
    color: '#F87171',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 6,
  },
});
