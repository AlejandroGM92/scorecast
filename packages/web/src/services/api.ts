import axios from 'axios';
import { useAuthStore } from '@/store/auth.store';

const API_URL = import.meta.env.VITE_API_URL || '';

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token automatically
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth
export const authApi = {
  validateToken: (code: string) => api.get(`/auth/validate-token/${code}`),
  login: (email: string, password: string, totpCode?: string) =>
    api.post('/auth/login', { email, password, ...(totpCode ? { totpCode } : {}) }),
  me: () => api.get('/auth/me'),
  updateProfile: (data: { email?: string; username?: string; whatsappNumber?: string | null }) => api.put('/auth/update-profile', data),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.put('/auth/change-password', { currentPassword, newPassword }),
  updateChampion: (teamCode: string) => api.put('/auth/champion', { teamCode }),
  championStatus: () => api.get('/auth/champion-status'),
  notifications: () => api.get('/auth/notifications'),
  markNotificationsRead: () => api.put('/auth/notifications/read'),
  clearNotifications: () => api.delete('/auth/notifications'),
  // 2FA
  setup2FA: () => api.get('/auth/2fa/setup'),
  enable2FA: (code: string) => api.post('/auth/2fa/enable', { code }),
  disable2FA: (code: string) => api.post('/auth/2fa/disable', { code }),
};

// Teams
export const teamsApi = {
  list: () => api.get('/teams'),
};

// Matches
export const matchesApi = {
  list: (params?: Record<string, string>) => api.get('/matches', { params }),
  live: () => api.get('/matches/live'),
  detail: (id: string) => api.get(`/matches/${id}`),
  statistics: (id: string) => api.get(`/matches/${id}/statistics`),
  summary: (id: string, preview?: boolean) => api.get(`/matches/${id}/summary${preview ? '?preview=1' : ''}`),
};

// Predictions
export const predictionsApi = {
  create: (matchId: string, predictedHome: number, predictedAway: number) =>
    api.post('/predictions', { matchId, predictedHome, predictedAway }),
  my: () => api.get('/predictions/my'),
  forMatch: (matchId: string) => api.get(`/predictions/match/${matchId}`),
};

// Leaderboard
export const leaderboardApi = {
  list: () => api.get('/leaderboard'),
  me: () => api.get('/leaderboard/me'),
  user: (userId: string) => api.get(`/leaderboard/${userId}`),
};

// Admin
export const adminApi = {
  tokens: {
    list: () => api.get('/admin/tokens'),
    create: (data: Record<string, unknown>) => api.post('/admin/tokens', data),
    update: (id: string, data: Record<string, unknown>) => api.put(`/admin/tokens/${id}`, data),
    delete: (id: string) => api.delete(`/admin/tokens/${id}`),
  },
  users: {
    list: () => api.get('/admin/users'),
    update: (id: string, data: Record<string, unknown>) => api.put(`/admin/users/${id}`, data),
    delete: (id: string) => api.delete(`/admin/users/${id}`),
  },
  matches: {
    list: () => api.get('/admin/matches'),
    setScore: (id: string, data: Record<string, unknown>) => api.put(`/admin/match/${id}/score`, data),
    calculatePoints: (id: string) => api.post(`/admin/calculate-points/${id}`),
    bulkStatus: (status: string) => api.post('/admin/matches/bulk-status', { status }),
  },
  apiUsage: () => api.get('/admin/api-usage'),
  testEmail: () => api.post('/admin/test-email'),
  testNotifyAll: (homeTeam: string, awayTeam: string) => api.post('/admin/test-notify-all', { homeTeam, awayTeam, hasPrediction: false }),
  simulateMatches: () => api.post('/admin/simulate-matches'),
  cleanupSimulation: () => api.delete('/admin/simulate-matches'),
  emailToggle: {
    get: () => api.get('/admin/email-toggle'),
    toggle: () => api.post('/admin/email-toggle'),
  },
  championLock: {
    get: () => api.get('/admin/champion-lock'),
    toggle: () => api.post('/admin/champion-lock'),
  },
  syncScores: () => api.post('/admin/sync-scores'),
  resetAllScores: () => api.post('/admin/reset-all-scores'),
  clearPredictions: () => api.delete('/admin/predictions'),
  exportUsers: () => api.get('/admin/users/export', { responseType: 'blob' }),
  seedMissingMatches: () => api.post('/admin/seed-missing-matches'),
  seedRoundOf32: () => api.post('/admin/seed-round-of-32'),
  fixRoundOf32Times: () => api.post('/admin/fix-round-of-32-times'),
  predictions: (matchId?: string) => api.get('/admin/predictions', { params: matchId ? { matchId } : undefined }),
  exportPredictions: () => api.get('/admin/predictions/export', { responseType: 'blob' }),
  calculateAllPoints: () => api.post('/admin/calculate-all-points'),
  resetAndRecalculate: () => api.post('/admin/reset-and-recalculate'),
  wcSync: () => api.post('/admin/wc-sync'),
  wcSyncLive: () => api.post('/admin/wc-sync-live'),
  syncGroups: () => api.post('/admin/sync-groups'),
  syncOdds: () => api.post('/admin/sync-odds'),
  calculatePoints: (matchId: string) => api.post(`/admin/calculate-points/${matchId}`),
  forceRecalculate: (matchId: string) => api.post(`/admin/force-recalculate/${matchId}`),
  debugMatch: (matchId: string) => api.get(`/admin/debug-match/${matchId}`),
  recalculateStandings: () => api.post('/admin/recalculate-standings'),
  suspiciousPredictions: () => api.get('/admin/suspicious-predictions'),
  deletePrediction: (id: string) => api.delete(`/admin/predictions/${id}`),
  predictForUser: (userId: string, matchId: string, predictedHome: number, predictedAway: number) =>
    api.post('/admin/predictions/for-user', { userId, matchId, predictedHome, predictedAway }),
  setMatchScore: (id: string, data: Record<string, unknown>) => api.put(`/admin/match/${id}/score`, data),
  config: {
    list: () => api.get('/admin/config'),
    update: (key: string, value: string) => api.put(`/admin/config/${key}`, { value }),
  },
};
