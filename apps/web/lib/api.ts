import axios from 'axios';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000';

export const apiClient = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 30_000,
});

// Attach JWT from localStorage on every request
apiClient.interceptors.request.use(config => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('safetracks_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('safetracks_token');
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  },
);

// ─── API helpers ──────────────────────────────────────────────────────────────

export const api = {
  jobs: {
    list: (params?: Record<string, string>) => apiClient.get('/jobs', { params }),
    get: (id: string) => apiClient.get(`/jobs/${id}`),
    create: (data: unknown) => apiClient.post('/jobs', data),
    updateStatus: (id: string, status: string) => apiClient.patch(`/jobs/${id}/status`, { status }),
    scan: (id: string, email: string) => apiClient.post(`/jobs/${id}/scan`, { email }),
    qrPng: (id: string) => `${API_URL}/api/qr/${id}/png`,
  },
  uploads: {
    list: (jobId: string, type?: string) => apiClient.get(`/uploads/${jobId}`, { params: { type } }),
    upload: (jobId: string, file: File, type: string, description?: string) => {
      const form = new FormData();
      form.append('file', file);
      form.append('jobId', jobId);
      form.append('type', type);
      if (description) form.append('description', description);
      return apiClient.post('/uploads', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 600_000, // 10 min for large video files
      });
    },
    getUrl: (docId: string) => apiClient.get(`/uploads/document/${docId}/url`),
  },
  moisture: {
    list: (jobId: string) => apiClient.get(`/moisture/${jobId}`),
    logReading: (data: unknown) => apiClient.post('/moisture/reading', data),
    logPsychro: (data: unknown) => apiClient.post('/moisture/psychro', data),
  },
  equipment: {
    list: (jobId: string) => apiClient.get(`/equipment/${jobId}`),
    place: (data: unknown) => apiClient.post('/equipment', data),
    remove: (id: string, data: unknown) => apiClient.patch(`/equipment/${id}/remove`, data),
  },
  reports: {
    list: (jobId: string) => apiClient.get(`/reports/${jobId}`),
    generate: (jobId: string) => apiClient.post(`/reports/${jobId}/generate`),
    pdfUrl: (jobId: string, reportId: string) => `${API_URL}/api/reports/${jobId}/${reportId}/pdf`,
  },
  audit: {
    get: (jobId: string) => apiClient.get(`/audit/${jobId}`),
  },
  qr: {
    resolve: (jobId: string, checksum: string) => apiClient.post('/qr/resolve', { jobId, checksum }),
  },
};
