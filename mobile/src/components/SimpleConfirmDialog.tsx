/**
 * SimpleConfirmDialog - Fallback dialog without SVG dependencies
 * Uses pure React Native components styled to match Miyabi theme
 */
import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { MiyabiColors, MiyabiSpacing } from '../styles/miyabi';

interface SimpleConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDangerous?: boolean;
}

const { width } = Dimensions.get('window');

export const SimpleConfirmDialog: React.FC<SimpleConfirmDialogProps> = ({
  visible,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  isDangerous = false,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.dialogContainer}>
          {/* Torii-inspired header using simple views */}
          <View style={styles.toriiHeader}>
            {/* Top beam */}
            <View style={[styles.topBeam, isDangerous && styles.dangerBeam]} />
            
            {/* Decorative ends */}
            <View style={[styles.leftEnd, isDangerous && styles.dangerEnd]} />
            <View style={[styles.rightEnd, isDangerous && styles.dangerEnd]} />
            
            {/* Second beam */}
            <View style={[styles.secondBeam, isDangerous && styles.dangerBeam]} />
            
            {/* Pillars */}
            <View style={[styles.leftPillar, isDangerous && styles.dangerPillar]} />
            <View style={[styles.rightPillar, isDangerous && styles.dangerPillar]} />
          </View>

          {/* Dialog Content */}
          <View style={styles.content}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.message}>{message}</Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onCancel}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelButtonText}>{cancelText}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.button,
                styles.confirmButton,
                isDangerous && styles.dangerButton,
              ]}
              onPress={onConfirm}
              activeOpacity={0.8}
            >
              <Text style={styles.confirmButtonText}>{confirmText}</Text>
            </TouchableOpacity>
          </View>

          {/* Bottom border */}
          <View style={[styles.bottomBorder, isDangerous && styles.dangerBorder]} />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dialogContainer: {
    width: width * 0.85,
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  toriiHeader: {
    height: 60,
    backgroundColor: '#FFEBEE',
    position: 'relative',
  },
  topBeam: {
    position: 'absolute',
    top: 8,
    left: 10,
    right: 10,
    height: 8,
    backgroundColor: '#C62828',
    borderRadius: 2,
  },
  leftEnd: {
    position: 'absolute',
    top: 6,
    left: 5,
    width: 8,
    height: 12,
    backgroundColor: '#8B0000',
    borderRadius: 2,
  },
  rightEnd: {
    position: 'absolute',
    top: 6,
    right: 5,
    width: 8,
    height: 12,
    backgroundColor: '#8B0000',
    borderRadius: 2,
  },
  secondBeam: {
    position: 'absolute',
    top: 22,
    left: 20,
    right: 20,
    height: 6,
    backgroundColor: '#C62828',
    borderRadius: 1,
  },
  leftPillar: {
    position: 'absolute',
    top: 18,
    left: 55,
    width: 14,
    height: 42,
    backgroundColor: '#D32F2F',
    borderRadius: 2,
  },
  rightPillar: {
    position: 'absolute',
    top: 18,
    right: 55,
    width: 14,
    height: 42,
    backgroundColor: '#D32F2F',
    borderRadius: 2,
  },
  dangerBeam: {
    backgroundColor: '#D32F2F',
  },
  dangerEnd: {
    backgroundColor: '#B71C1C',
  },
  dangerPillar: {
    backgroundColor: '#E53935',
  },
  content: {
    padding: 24,
    paddingTop: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: MiyabiColors.sumi,
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    color: MiyabiColors.sumiLight,
    lineHeight: 22,
    textAlign: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: MiyabiColors.sumi,
  },
  confirmButton: {
    backgroundColor: MiyabiColors.bamboo,
  },
  dangerButton: {
    backgroundColor: '#E53935',
  },
  confirmButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  bottomBorder: {
    height: 4,
    backgroundColor: MiyabiColors.bamboo,
  },
  dangerBorder: {
    backgroundColor: '#D32F2F',
  },
});
