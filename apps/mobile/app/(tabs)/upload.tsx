import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as SecureStore from 'expo-secure-store';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

const DOC_TYPES = [
  { value: 'photo',                     label: 'Photo',               icon: '📷' },
  { value: 'video',                     label: 'Video',               icon: '🎥' },
  { value: 'moisture_log',              label: 'Moisture Log',        icon: '💧' },
  { value: 'xactimate_export',          label: 'Xactimate Export',    icon: '📊' },
  { value: 'equipment_report',          label: 'Equipment Report',    icon: '⚙️' },
  { value: 'work_plan_s500',            label: 'S500 Work Plan',      icon: '📋' },
  { value: 'work_plan_s700',            label: 'S700 Work Plan',      icon: '📋' },
  { value: 'scope_of_loss',             label: 'Scope of Loss',       icon: '📝' },
  { value: 'invoice',                   label: 'Invoice',             icon: '💰' },
  { value: 'other',                     label: 'Other',               icon: '📎' },
];

interface UploadItem {
  uri: string;
  name: string;
  type: string;
  mimeType: string;
  size: number;
  docType: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  cid?: string;
  error?: string;
}

export default function UploadScreen() {
  const [selectedDocType, setSelectedDocType] = useState('photo');
  const [queue, setQueue] = useState<UploadItem[]>([]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please allow media library access.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      quality: 0.9,
    });

    if (!result.canceled) {
      const items: UploadItem[] = result.assets.map(a => ({
        uri: a.uri,
        name: a.fileName ?? `photo-${Date.now()}.jpg`,
        type: 'file',
        mimeType: a.mimeType ?? 'image/jpeg',
        size: a.fileSize ?? 0,
        docType: selectedDocType,
        status: 'pending',
      }));
      setQueue(prev => [...prev, ...items]);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please allow camera access.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.9,
    });

    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0];
      setQueue(prev => [...prev, {
        uri: a.uri,
        name: a.fileName ?? `capture-${Date.now()}.jpg`,
        type: 'file',
        mimeType: a.mimeType ?? 'image/jpeg',
        size: a.fileSize ?? 0,
        docType: selectedDocType,
        status: 'pending',
      }]);
    }
  };

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({ multiple: true });
    if (!result.canceled) {
      const items: UploadItem[] = result.assets.map(a => ({
        uri: a.uri,
        name: a.name,
        type: 'file',
        mimeType: a.mimeType ?? 'application/octet-stream',
        size: a.size ?? 0,
        docType: selectedDocType,
        status: 'pending',
      }));
      setQueue(prev => [...prev, ...items]);
    }
  };

  const uploadItem = async (idx: number) => {
    const item = queue[idx];
    if (!item || item.status !== 'pending') return;

    const token = await SecureStore.getItemAsync('safetracks_token');
    const jobId = await SecureStore.getItemAsync('safetracks_job_id');

    if (!token || !jobId) {
      Alert.alert('Not authenticated', 'Please scan a job QR code first.');
      return;
    }

    setQueue(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx]!, status: 'uploading' };
      return next;
    });

    try {
      const formData = new FormData();
      formData.append('file', { uri: item.uri, name: item.name, type: item.mimeType } as any);
      formData.append('jobId', jobId);
      formData.append('type', item.docType);

      const res = await axios.post(`${API_URL}/api/uploads`, formData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
        timeout: 600_000,
      });

      setQueue(prev => {
        const next = [...prev];
        next[idx] = { ...next[idx]!, status: 'done', cid: res.data.document.bethelnetCid };
        return next;
      });
    } catch (err: any) {
      setQueue(prev => {
        const next = [...prev];
        next[idx] = { ...next[idx]!, status: 'error', error: err.response?.data?.error ?? 'Upload failed' };
        return next;
      });
    }
  };

  const uploadAll = () => {
    queue.forEach((item, idx) => {
      if (item.status === 'pending') uploadItem(idx);
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Upload Documents</Text>
      <Text style={styles.subtitle}>
        Large files are automatically stored on Bethelnet with ZK proof. Only the hash is anchored on-chain.
      </Text>

      {/* Document type selector */}
      <Text style={styles.sectionLabel}>Document Type</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeScroll}>
        {DOC_TYPES.map(dt => (
          <TouchableOpacity
            key={dt.value}
            style={[styles.typeChip, selectedDocType === dt.value && styles.typeChipActive]}
            onPress={() => setSelectedDocType(dt.value)}
          >
            <Text style={styles.typeChipIcon}>{dt.icon}</Text>
            <Text style={[styles.typeChipText, selectedDocType === dt.value && styles.typeChipTextActive]}>
              {dt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Source buttons */}
      <View style={styles.sourceRow}>
        <TouchableOpacity style={styles.sourceButton} onPress={takePhoto}>
          <Text style={styles.sourceIcon}>📷</Text>
          <Text style={styles.sourceLabel}>Camera</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.sourceButton} onPress={pickImage}>
          <Text style={styles.sourceIcon}>🖼️</Text>
          <Text style={styles.sourceLabel}>Gallery</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.sourceButton} onPress={pickDocument}>
          <Text style={styles.sourceIcon}>📁</Text>
          <Text style={styles.sourceLabel}>Files</Text>
        </TouchableOpacity>
      </View>

      {/* Upload queue */}
      {queue.length > 0 && (
        <>
          <View style={styles.queueHeader}>
            <Text style={styles.sectionLabel}>{queue.length} file(s) queued</Text>
            {queue.some(q => q.status === 'pending') && (
              <TouchableOpacity style={styles.uploadAllButton} onPress={uploadAll}>
                <Text style={styles.uploadAllText}>Upload All</Text>
              </TouchableOpacity>
            )}
          </View>

          {queue.map((item, idx) => (
            <View key={idx} style={styles.queueItem}>
              <View style={styles.queueItemInfo}>
                <Text style={styles.queueItemName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.queueItemMeta}>
                  {item.docType.replace(/_/g, ' ')} · {formatBytes(item.size)}
                </Text>
                {item.status === 'done' && (
                  <Text style={styles.cid} numberOfLines={1}>CID: {item.cid?.slice(0, 32)}...</Text>
                )}
                {item.status === 'error' && <Text style={styles.errorText}>{item.error}</Text>}
              </View>
              <View style={styles.queueItemActions}>
                {item.status === 'pending' && (
                  <TouchableOpacity style={styles.uploadButton} onPress={() => uploadItem(idx)}>
                    <Text style={styles.uploadButtonText}>Upload</Text>
                  </TouchableOpacity>
                )}
                {item.status === 'uploading' && <ActivityIndicator size="small" color="#2E86C1" />}
                {item.status === 'done' && <Text style={styles.doneIcon}>✅</Text>}
                {item.status === 'error' && <Text style={styles.errorIcon}>❌</Text>}
              </View>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#1B4F72', marginBottom: 4 },
  subtitle: { color: '#64748b', fontSize: 13, marginBottom: 20, lineHeight: 18 },
  sectionLabel: { fontSize: 12, fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  typeScroll: { marginBottom: 20 },
  typeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1, borderColor: '#cbd5e1',
    backgroundColor: '#fff', marginRight: 8,
  },
  typeChipActive: { backgroundColor: '#1B4F72', borderColor: '#1B4F72' },
  typeChipIcon: { fontSize: 14 },
  typeChipText: { fontSize: 12, color: '#64748b', fontWeight: '500' },
  typeChipTextActive: { color: '#fff' },
  sourceRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  sourceButton: {
    flex: 1, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1,
    borderColor: '#e2e8f0', padding: 16, alignItems: 'center',
  },
  sourceIcon: { fontSize: 28, marginBottom: 4 },
  sourceLabel: { fontSize: 12, color: '#64748b', fontWeight: '500' },
  queueHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  uploadAllButton: { backgroundColor: '#2E86C1', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
  uploadAllText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  queueItem: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    flexDirection: 'row', alignItems: 'center', marginBottom: 8,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  queueItemInfo: { flex: 1, marginRight: 12 },
  queueItemName: { fontSize: 13, fontWeight: '600', color: '#1e293b', marginBottom: 2 },
  queueItemMeta: { fontSize: 11, color: '#94a3b8' },
  cid: { fontSize: 10, color: '#27AE60', fontFamily: 'monospace', marginTop: 2 },
  errorText: { fontSize: 11, color: '#ef4444', marginTop: 2 },
  queueItemActions: { alignItems: 'center' },
  uploadButton: { backgroundColor: '#2E86C1', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  uploadButtonText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  doneIcon: { fontSize: 20 },
  errorIcon: { fontSize: 20 },
});
