import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

const MATERIALS = [
  { key: 'drywall',        label: 'Drywall',         std: 14 },
  { key: 'framing_lumber', label: 'Framing Lumber',  std: 16 },
  { key: 'plywood_subfloor', label: 'Plywood Subfloor', std: 16 },
  { key: 'hardwood_floor', label: 'Hardwood Floor',  std: 12 },
  { key: 'concrete_slab',  label: 'Concrete Slab',   std: 4  },
  { key: 'osb',            label: 'OSB',             std: 18 },
  { key: 'trim_baseboard', label: 'Trim/Baseboard',  std: 14 },
];

type LogType = 'moisture' | 'psychro';

export default function MoistureScreen() {
  const [logType, setLogType] = useState<LogType>('moisture');
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  const [moisture, setMoisture] = useState({
    room: '', location: '', material: 'drywall', readingPct: '', dryStandard: '14',
  });

  const [psychro, setPsychro] = useState({
    room: '', temperatureF: '', relativeHumidityPct: '',
  });

  const submit = async () => {
    const token = await SecureStore.getItemAsync('safetracks_token');
    const jobId = await SecureStore.getItemAsync('safetracks_job_id');

    if (!token || !jobId) {
      Alert.alert('Not authenticated', 'Please scan a job QR code first.');
      return;
    }

    setLoading(true);
    try {
      let res;
      if (logType === 'moisture') {
        res = await axios.post(
          `${API_URL}/api/moisture/reading`,
          {
            jobId,
            room: moisture.room,
            location: moisture.location,
            material: moisture.material,
            readingPct: parseFloat(moisture.readingPct),
            dryStandard: parseFloat(moisture.dryStandard),
          },
          { headers: { Authorization: `Bearer ${token}` } },
        );
      } else {
        res = await axios.post(
          `${API_URL}/api/moisture/psychro`,
          {
            jobId,
            room: psychro.room,
            temperatureF: parseFloat(psychro.temperatureF),
            relativeHumidityPct: parseFloat(psychro.relativeHumidityPct),
          },
          { headers: { Authorization: `Bearer ${token}` } },
        );
      }
      setLastResult(res.data);
      Alert.alert('Logged!', `Reading anchored on Hedera: ${res.data.hederaTxId ?? 'saved'}`);
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error ?? 'Failed to log reading');
    } finally {
      setLoading(false);
    }
  };

  const selectMaterial = (key: string, std: number) => {
    setMoisture(prev => ({ ...prev, material: key, dryStandard: String(std) }));
  };

  const isDry = lastResult?.readingPct !== undefined && lastResult.readingPct <= lastResult.dryStandard;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Log Field Reading</Text>

      {/* Tab */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, logType === 'moisture' && styles.tabActive]}
          onPress={() => setLogType('moisture')}
        >
          <Text style={[styles.tabText, logType === 'moisture' && styles.tabTextActive]}>
            💧 Moisture
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, logType === 'psychro' && styles.tabActive]}
          onPress={() => setLogType('psychro')}
        >
          <Text style={[styles.tabText, logType === 'psychro' && styles.tabTextActive]}>
            🌡️ Psychrometric
          </Text>
        </TouchableOpacity>
      </View>

      {logType === 'moisture' && (
        <>
          <Field label="Room" value={moisture.room} onChange={v => setMoisture(p => ({ ...p, room: v }))} placeholder="e.g. Master Bedroom" />
          <Field label="Location on Surface" value={moisture.location} onChange={v => setMoisture(p => ({ ...p, location: v }))} placeholder="e.g. N wall, 12in from floor" />
          <Field label="Moisture Reading (%)" value={moisture.readingPct} onChange={v => setMoisture(p => ({ ...p, readingPct: v }))} placeholder="e.g. 22" keyboardType="numeric" />

          <Text style={styles.sectionLabel}>Material</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.materialScroll}>
            {MATERIALS.map(m => (
              <TouchableOpacity
                key={m.key}
                style={[styles.materialChip, moisture.material === m.key && styles.materialChipActive]}
                onPress={() => selectMaterial(m.key, m.std)}
              >
                <Text style={[styles.materialChipText, moisture.material === m.key && styles.materialChipTextActive]}>
                  {m.label}
                </Text>
                <Text style={[styles.materialChipStd, moisture.material === m.key && styles.materialChipTextActive]}>
                  Std: {m.std}%
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {moisture.readingPct && (
            <View style={[
              styles.readingResult,
              parseFloat(moisture.readingPct) <= parseFloat(moisture.dryStandard) ? styles.resultDry : styles.resultWet,
            ]}>
              <Text style={styles.readingResultText}>
                {parseFloat(moisture.readingPct) <= parseFloat(moisture.dryStandard)
                  ? `✅ DRY — ${moisture.readingPct}% (std: ${moisture.dryStandard}%)`
                  : `⚠️ WET — ${moisture.readingPct}% (std: ${moisture.dryStandard}%)`
                }
              </Text>
            </View>
          )}
        </>
      )}

      {logType === 'psychro' && (
        <>
          <Field label="Room" value={psychro.room} onChange={v => setPsychro(p => ({ ...p, room: v }))} placeholder="e.g. Living Room" />
          <Field label="Temperature (°F)" value={psychro.temperatureF} onChange={v => setPsychro(p => ({ ...p, temperatureF: v }))} placeholder="e.g. 76" keyboardType="numeric" />
          <Field label="Relative Humidity (%)" value={psychro.relativeHumidityPct} onChange={v => setPsychro(p => ({ ...p, relativeHumidityPct: v }))} placeholder="e.g. 58" keyboardType="numeric" />
          <Text style={styles.hint}>Dew point and grains/lb are calculated automatically.</Text>
        </>
      )}

      <TouchableOpacity
        style={[styles.submitButton, loading && styles.submitDisabled]}
        onPress={submit}
        disabled={loading}
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.submitText}>Log Reading → Hedera</Text>
        }
      </TouchableOpacity>
    </ScrollView>
  );
}

function Field({ label, value, onChange, placeholder, keyboardType }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; keyboardType?: 'default' | 'numeric' | 'email-address';
}) {
  return (
    <View style={styles.fieldContainer}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.fieldInput}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        keyboardType={keyboardType ?? 'default'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#1B4F72', marginBottom: 20 },
  tabRow: { flexDirection: 'row', marginBottom: 20, backgroundColor: '#e2e8f0', borderRadius: 12, padding: 4 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  tabActive: { backgroundColor: '#1B4F72' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  tabTextActive: { color: '#fff' },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 8 },
  materialScroll: { marginBottom: 16 },
  materialChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#fff', marginRight: 8, alignItems: 'center',
  },
  materialChipActive: { backgroundColor: '#1B4F72', borderColor: '#1B4F72' },
  materialChipText: { fontSize: 12, color: '#334155', fontWeight: '600' },
  materialChipStd: { fontSize: 10, color: '#94a3b8' },
  materialChipTextActive: { color: '#fff' },
  readingResult: { borderRadius: 10, padding: 12, marginBottom: 16 },
  resultDry: { backgroundColor: '#f0fdf4', borderColor: '#86efac', borderWidth: 1 },
  resultWet: { backgroundColor: '#fef2f2', borderColor: '#fca5a5', borderWidth: 1 },
  readingResultText: { fontSize: 14, fontWeight: '600', color: '#1e293b' },
  fieldContainer: { marginBottom: 14 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#64748b', marginBottom: 6 },
  fieldInput: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#1e293b',
  },
  hint: { color: '#94a3b8', fontSize: 12, marginBottom: 16, fontStyle: 'italic' },
  submitButton: {
    backgroundColor: '#2E86C1', borderRadius: 14,
    paddingVertical: 18, alignItems: 'center', marginTop: 8,
  },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
