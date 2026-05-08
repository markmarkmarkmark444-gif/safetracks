import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Camera, CameraView, BarcodeScanningResult } from 'expo-camera';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

type ScanStep = 'camera' | 'email' | 'loading' | 'success';

export default function ScanScreen() {
  const [step, setStep] = useState<ScanStep>('camera');
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [jobPreview, setJobPreview] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [scannedJobId, setScannedJobId] = useState('');
  const [scannedChecksum, setScannedChecksum] = useState('');
  const scanned = useRef(false);

  useEffect(() => {
    Camera.requestCameraPermissionsAsync().then(({ status }) => {
      setHasPermission(status === 'granted');
    });
  }, []);

  const handleBarCodeScanned = async ({ data }: BarcodeScanningResult) => {
    if (scanned.current) return;
    scanned.current = true;

    try {
      // Parse the SafeTracks QR URL format: https://app.safetracks.io/scan/{jobId}?t={checksum}
      const url = new URL(data);
      const pathParts = url.pathname.split('/');
      const jobId = pathParts[pathParts.length - 1];
      const checksum = url.searchParams.get('t') ?? '';

      if (!jobId || !checksum) {
        Alert.alert('Invalid QR', 'This is not a valid SafeTracks QR code.', [
          { text: 'OK', onPress: () => { scanned.current = false; } },
        ]);
        return;
      }

      setScannedJobId(jobId);
      setScannedChecksum(checksum);

      // Resolve QR against API
      const res = await axios.post(`${API_URL}/api/qr/resolve`, { jobId, checksum });
      setJobPreview(res.data);
      setStep('email');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error ?? 'Could not resolve QR code', [
        { text: 'Try Again', onPress: () => { scanned.current = false; } },
      ]);
    }
  };

  const handleLogin = async () => {
    if (!email.trim()) return;
    setStep('loading');

    try {
      const res = await axios.post(`${API_URL}/api/jobs/${scannedJobId}/scan`, { email });
      await SecureStore.setItemAsync('safetracks_token', res.data.accessToken);
      await SecureStore.setItemAsync('safetracks_job_id', scannedJobId);
      await SecureStore.setItemAsync('safetracks_role', res.data.role);
      setStep('success');
    } catch (err: any) {
      Alert.alert('Access Denied', err.response?.data?.error ?? 'Email not registered for this job.');
      setStep('email');
    }
  };

  if (hasPermission === null) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#2E86C1" /></View>;
  }

  if (!hasPermission) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Camera permission required to scan QR codes.</Text>
      </View>
    );
  }

  if (step === 'camera') {
    return (
      <View style={styles.container}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          onBarcodeScanned={handleBarCodeScanned}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        />
        <View style={styles.overlay}>
          <Text style={styles.scanTitle}>SafeTracks</Text>
          <Text style={styles.scanSubtitle}>Point camera at job QR code</Text>
          <View style={styles.scanBox} />
        </View>
      </View>
    );
  }

  if (step === 'email' && jobPreview) {
    return (
      <ScrollView style={styles.formContainer} contentContainerStyle={styles.formContent}>
        {/* Job preview */}
        <View style={styles.jobCard}>
          <Text style={styles.verified}>✅ Verified on Hedera</Text>
          <Text style={styles.jobNumber}>{jobPreview.jobNumber}</Text>
          <Text style={styles.jobAddress}>{jobPreview.address}</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Type:</Text>
            <Text style={styles.value}>{jobPreview.type.toUpperCase()}</Text>
          </View>
          {jobPreview.claimNumber && (
            <View style={styles.row}>
              <Text style={styles.label}>Claim #:</Text>
              <Text style={styles.value}>{jobPreview.claimNumber}</Text>
            </View>
          )}
        </View>

        <Text style={styles.loginPrompt}>Enter your email to access this job:</Text>

        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="your@email.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />

        <TouchableOpacity
          style={[styles.button, !email && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={!email}
        >
          <Text style={styles.buttonText}>Access Job</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => { scanned.current = false; setStep('camera'); }}>
          <Text style={styles.back}>← Scan different code</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  if (step === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2E86C1" />
        <Text style={styles.loadingText}>Verifying access...</Text>
      </View>
    );
  }

  if (step === 'success') {
    return (
      <View style={styles.center}>
        <Text style={styles.successIcon}>✅</Text>
        <Text style={styles.successTitle}>Access Granted!</Text>
        <Text style={styles.successSub}>You now have access to {jobPreview?.jobNumber}</Text>
        <TouchableOpacity style={styles.button} onPress={() => router.push('/(tabs)/upload')}>
          <Text style={styles.buttonText}>Upload Documents →</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.buttonSecondary]} onPress={() => router.push('/(tabs)/moisture')}>
          <Text style={styles.buttonTextSecondary}>Log Moisture Reading →</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  overlay: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  scanTitle: { color: '#fff', fontSize: 24, fontWeight: 'bold', marginBottom: 4 },
  scanSubtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 14, marginBottom: 32 },
  scanBox: {
    width: 240, height: 240,
    borderWidth: 2, borderColor: '#2E86C1', borderRadius: 12,
    backgroundColor: 'transparent',
  },
  formContainer: { flex: 1, backgroundColor: '#f8fafc' },
  formContent: { padding: 24 },
  jobCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 3, marginBottom: 24,
  },
  verified: { color: '#27AE60', fontSize: 12, fontWeight: '600', marginBottom: 8 },
  jobNumber: { fontSize: 22, fontWeight: 'bold', color: '#1B4F72', marginBottom: 4 },
  jobAddress: { color: '#64748b', fontSize: 13, marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  label: { color: '#94a3b8', fontSize: 12, fontWeight: '600' },
  value: { color: '#334155', fontSize: 12, fontWeight: '500' },
  loginPrompt: { color: '#475569', fontSize: 14, marginBottom: 12 },
  input: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1',
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, marginBottom: 16,
  },
  button: {
    backgroundColor: '#2E86C1', borderRadius: 12,
    paddingVertical: 16, alignItems: 'center', marginBottom: 12,
  },
  buttonSecondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#2E86C1' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  buttonTextSecondary: { color: '#2E86C1', fontSize: 16, fontWeight: '600' },
  back: { color: '#94a3b8', textAlign: 'center', marginTop: 8 },
  loadingText: { marginTop: 16, color: '#64748b' },
  errorText: { color: '#ef4444', textAlign: 'center', padding: 24 },
  successIcon: { fontSize: 64, marginBottom: 16 },
  successTitle: { fontSize: 24, fontWeight: 'bold', color: '#1B4F72', marginBottom: 8 },
  successSub: { color: '#64748b', marginBottom: 24, textAlign: 'center' },
});
