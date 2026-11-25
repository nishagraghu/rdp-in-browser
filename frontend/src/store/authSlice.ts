import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import api, { getAccessToken, setAccessToken } from '../api/client';
import { UserDto } from '@rdp/shared';

export interface TwoFactorPending {
  challengeToken: string;
  emailHint?: string;
  twoFactorType?: 'EMAIL' | 'TOTP';
  requiresTotpSetup?: boolean;
  qrCodeDataUrl?: string;
  secret?: string;
  expiresInSeconds: number;
}

interface AuthState {
  user: UserDto | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isLoggingIn: boolean;
  isSetupRequired: boolean;
  error: string | null;
  twoFactorPending: TwoFactorPending | null;
}

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  isLoggingIn: false,
  isSetupRequired: false,
  error: null,
  twoFactorPending: null,
};

export const checkSetupStatus = createAsyncThunk('auth/checkSetupStatus', async () => {
  try {
    const res = await api.get('/auth/setup-status');
    return res.data.data.setupRequired;
  } catch {
    return false;
  }
});

export const fetchCurrentUser = createAsyncThunk(
  'auth/fetchCurrentUser',
  async (_, { rejectWithValue }) => {
    try {
      let token = getAccessToken();
      if (!token) {
        try {
          const refreshRes = await api.post('/auth/refresh');
          if (refreshRes.data?.success && refreshRes.data?.data?.accessToken) {
            token = refreshRes.data.data.accessToken;
            setAccessToken(token);
          } else {
            return rejectWithValue('Unauthenticated');
          }
        } catch {
          return rejectWithValue('Unauthenticated');
        }
      }

      try {
        const res = await api.get('/auth/me');
        return res.data.data;
      } catch (meErr: any) {
        // If /auth/me failed with 401, attempt token refresh before logging out
        if (meErr.response?.status === 401) {
          try {
            const refreshRes = await api.post('/auth/refresh');
            if (refreshRes.data?.success && refreshRes.data?.data?.accessToken) {
              const newToken = refreshRes.data.data.accessToken;
              setAccessToken(newToken);
              const retryRes = await api.get('/auth/me', {
                headers: { Authorization: `Bearer ${newToken}` },
              });
              return retryRes.data.data;
            }
          } catch (refErr: any) {
            if (refErr.response?.status === 401 || refErr.response?.status === 403) {
              setAccessToken(null);
            }
            return rejectWithValue('Unauthenticated');
          }
        }

        // Only clear token if server actively returned 401/403
        if (meErr.response?.status === 401 || meErr.response?.status === 403) {
          setAccessToken(null);
        }
        return rejectWithValue(meErr.response?.data?.error || 'Unauthenticated');
      }
    } catch (err: unknown) {
      return rejectWithValue('Unauthenticated');
    }
  }
);

export type LoginResult =
  | { kind: 'authenticated'; user: UserDto }
  | {
      kind: 'requires2FA';
      challengeToken: string;
      emailHint?: string;
      twoFactorType?: 'EMAIL' | 'TOTP';
      requiresTotpSetup?: boolean;
      qrCodeDataUrl?: string;
      secret?: string;
      expiresInSeconds: number;
    };

export const loginUser = createAsyncThunk(
  'auth/loginUser',
  async (credentials: { usernameOrEmail: string; password: string }, { rejectWithValue }) => {
    try {
      const res = await api.post('/auth/login', credentials);
      if (!res.data.success) {
        return rejectWithValue(res.data.error || 'Login failed');
      }

      const data = res.data.data;
      if (data?.requires2FA && data.challengeToken) {
        return {
          kind: 'requires2FA' as const,
          challengeToken: data.challengeToken as string,
          emailHint: (data.emailHint as string) || undefined,
          twoFactorType: (data.twoFactorType as 'EMAIL' | 'TOTP') || 'EMAIL',
          requiresTotpSetup: Boolean(data.requiresTotpSetup),
          qrCodeDataUrl: (data.qrCodeDataUrl as string) || undefined,
          secret: (data.secret as string) || undefined,
          expiresInSeconds: (data.expiresInSeconds as number) || 600,
        };
      }

      if (data?.accessToken && data?.user) {
        setAccessToken(data.accessToken);
        return { kind: 'authenticated' as const, user: data.user as UserDto };
      }

      return rejectWithValue('Unexpected login response');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      return rejectWithValue(error.response?.data?.error || 'Login failed');
    }
  }
);

export const verifyTwoFactorCode = createAsyncThunk(
  'auth/verifyTwoFactorCode',
  async (payload: { challengeToken: string; code: string }, { rejectWithValue }) => {
    try {
      const res = await api.post('/auth/verify-2fa', payload);
      if (!res.data.success || !res.data.data?.accessToken || !res.data.data?.user) {
        return rejectWithValue(res.data.error || 'Verification failed');
      }
      setAccessToken(res.data.data.accessToken);
      return res.data.data.user as UserDto;
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      return rejectWithValue(error.response?.data?.error || 'Verification failed');
    }
  }
);

export const resendTwoFactorCode = createAsyncThunk(
  'auth/resendTwoFactorCode',
  async (challengeToken: string, { rejectWithValue }) => {
    try {
      const res = await api.post('/auth/resend-2fa', { challengeToken });
      if (!res.data.success || !res.data.data?.challengeToken) {
        return rejectWithValue(res.data.error || 'Failed to resend code');
      }
      return {
        challengeToken: res.data.data.challengeToken as string,
        emailHint: (res.data.data.emailHint as string) || '***',
        expiresInSeconds: (res.data.data.expiresInSeconds as number) || 600,
      };
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      return rejectWithValue(error.response?.data?.error || 'Failed to resend code');
    }
  }
);

export const logoutUser = createAsyncThunk('auth/logoutUser', async () => {
  try {
    await api.post('/auth/logout');
  } finally {
    setAccessToken(null);
  }
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setSetupRequired(state, action: PayloadAction<boolean>) {
      state.isSetupRequired = action.payload;
    },
    clearAuthError(state) {
      state.error = null;
    },
    clearTwoFactorPending(state) {
      state.twoFactorPending = null;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(checkSetupStatus.fulfilled, (state, action) => {
        state.isSetupRequired = action.payload;
      })
      .addCase(fetchCurrentUser.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(fetchCurrentUser.fulfilled, (state, action) => {
        state.user = action.payload;
        state.isAuthenticated = true;
        state.isLoading = false;
        state.error = null;
        state.twoFactorPending = null;
      })
      .addCase(fetchCurrentUser.rejected, (state) => {
        state.user = null;
        state.isAuthenticated = false;
        state.isLoading = false;
      })
      .addCase(loginUser.pending, (state) => {
        state.isLoggingIn = true;
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.isLoggingIn = false;
        state.error = null;
        if (action.payload.kind === 'authenticated') {
          state.user = action.payload.user;
          state.isAuthenticated = true;
          state.twoFactorPending = null;
        } else {
          state.twoFactorPending = {
            challengeToken: action.payload.challengeToken,
            emailHint: action.payload.emailHint,
            twoFactorType: action.payload.twoFactorType,
            requiresTotpSetup: action.payload.requiresTotpSetup,
            qrCodeDataUrl: action.payload.qrCodeDataUrl,
            secret: action.payload.secret,
            expiresInSeconds: action.payload.expiresInSeconds,
          };
        }
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.isLoggingIn = false;
        state.error = action.payload as string;
      })
      .addCase(verifyTwoFactorCode.pending, (state) => {
        state.isLoggingIn = true;
        state.error = null;
      })
      .addCase(verifyTwoFactorCode.fulfilled, (state, action) => {
        state.user = action.payload;
        state.isAuthenticated = true;
        state.isLoggingIn = false;
        state.error = null;
        state.twoFactorPending = null;
      })
      .addCase(verifyTwoFactorCode.rejected, (state, action) => {
        state.isLoggingIn = false;
        state.error = action.payload as string;
      })
      .addCase(resendTwoFactorCode.pending, (state) => {
        state.error = null;
      })
      .addCase(resendTwoFactorCode.fulfilled, (state, action) => {
        state.twoFactorPending = action.payload;
      })
      .addCase(resendTwoFactorCode.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(logoutUser.fulfilled, (state) => {
        state.user = null;
        state.isAuthenticated = false;
        state.isLoading = false;
        state.twoFactorPending = null;
      });
  },
});

export const { setSetupRequired, clearAuthError, clearTwoFactorPending } = authSlice.actions;
export default authSlice.reducer;
