import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import Svg, { Path, Rect, Line } from 'react-native-svg';
import { MiyabiColors, MiyabiSpacing } from '../styles/miyabi';

interface ToriiConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDangerous?: boolean; // For destructive actions (red theme)
}

const { width } = Dimensions.get('window');

export const ToriiConfirmDialog: React.FC<ToriiConfirmDialogProps> = ({
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
          {/* Torii Gate Header */}
          <View style={styles.toriiHeader}>
            <Svg width={width * 0.7} height={60} viewBox="0 0 280 60">
              {/* Top horizontal beam (Kasagi) */}
              <Rect
                x={10}
                y={8}
                width={260}
                height={8}
                fill={isDangerous ? '#D32F2F' : '#C62828'}
                rx={2}
              />
              
              {/* Top beam decorative ends */}
              <Rect x={5} y={6} width={8} height={12} fill={isDangerous ? '#B71C1C' : '#8B0000'} rx={2} />
              <Rect x={267} y={6} width={8} height={12} fill={isDangerous ? '#B71C1C' : '#8B0000'} rx={2} />
              
              {/* Second horizontal beam (Nuki) */}
              <Rect
                x={20}
                y={22}
                width={240}
                height={6}
                fill={isDangerous ? '#D32F2F' : '#C62828'}
                rx={1}
              />
              
              {/* Left pillar */}
              <Rect
                x={55}
                y={18}
                width={14}
                height={42}
                fill={isDangerous ? '#E53935' : '#D32F2F'}
                rx={2}
              />
              
              {/* Right pillar */}
              <Rect
                x={211}
                y={18}
                width={14}
                height={42}
                fill={isDangerous ? '#E53935' : '#D32F2F'}
                rx={2}
              />
              
              {/* Pillar bases */}
              <Rect x={52} y={57} width={20} height={3} fill={isDangerous ? '#B71C1C' : '#8B0000'} />
              <Rect x={208} y={57} width={20} height={3} fill={isDangerous ? '#B71C1C' : '#8B0000'} />
              
              {/* Decorative accent lines */}
              <Line x1={62} y1={20} x2={62} y2={55} stroke="#FFFFFF" strokeWidth={1} opacity={0.3} />
              <Line x1={218} y1={20} x2={218} y2={55} stroke="#FFFFFF" strokeWidth={1} opacity={0.3} />
            </Svg>
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

          {/* Bottom decorative border */}
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
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  toriiHeader: {
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 10,
    backgroundColor: '#FFF9F0',
  },
  content: {
    paddingHorizontal: MiyabiSpacing.lg,
    paddingVertical: MiyabiSpacing.xl,
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: MiyabiColors.sumi,
    marginBottom: MiyabiSpacing.md,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  message: {
    fontSize: 16,
    color: MiyabiColors.sumiLight,
    textAlign: 'center',
    lineHeight: 24,
  },
  buttonContainer: {
    flexDirection: 'row',
    paddingHorizontal: MiyabiSpacing.md,
    paddingBottom: MiyabiSpacing.lg,
    gap: MiyabiSpacing.md,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: MiyabiColors.sumiLight,
  },
  confirmButton: {
    backgroundColor: MiyabiColors.bamboo,
  },
  dangerButton: {
    backgroundColor: '#D32F2F',
  },
  confirmButtonText: {
    fontSize: 16,
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
