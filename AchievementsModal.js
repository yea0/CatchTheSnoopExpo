import React from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const GOLD = '#FBBF24';
const CARD_BG = 'rgba(255,255,255,0.08)';
const CARD_BORDER = 'rgba(255,255,255,0.16)';
const TEXT_SECONDARY = 'rgba(255,255,255,0.65)';

export default function AchievementsModal({ visible, onClose, achievements, unlockedIds }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Achievements</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color="#ffffff" />
            </TouchableOpacity>
          </View>
          <ScrollView>
            {achievements.map(a => {
              const unlocked = unlockedIds.includes(a.id);
              return (
                <View key={a.id} style={styles.row}>
                  <Ionicons
                    name={unlocked ? a.icon : 'lock-closed-outline'}
                    size={22}
                    color={unlocked ? GOLD : 'rgba(255,255,255,0.3)'}
                  />
                  <View style={styles.textWrap}>
                    <Text style={[styles.rowTitle, !unlocked && styles.rowTitleLocked]}>{a.title}</Text>
                    <Text style={styles.rowDesc}>{a.description}</Text>
                  </View>
                  {unlocked && <Ionicons name="checkmark-circle" size={20} color="#34D399" />}
                </View>
              );
            })}
          </ScrollView>
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
    maxHeight: '75%',
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
    marginBottom: 14,
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
  textWrap: {
    flex: 1,
    marginLeft: 12,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#ffffff',
  },
  rowTitleLocked: {
    color: 'rgba(255,255,255,0.4)',
  },
  rowDesc: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    marginTop: 2,
  },
});
