import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import api, { getAccessToken, setAccessToken } from '../api/client';
import { UserDto } from '@rdp/shared';

interface AuthState {
  user: UserDto | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isSetupRequired: boolean;
  error: string | null;
}

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  isSetupRequired: false,
  error: null,
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
      const res = await api.get('/auth/me');
      return res.data.data;
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      return rejectWithValue(error.response?.data?.error || 'Unauthenticated');
    }
  }
);

export const loginUser = createAsyncThunk(
  'auth/loginUser',
  async (credentials: { usernameOrEmail: string; password: string }, { rejectWithValue }) => {
    try {
      const res = await api.post('/auth/login', credentials);
      if (res.data.success) {
        setAccessToken(res.data.data.accessToken);
        return res.data.data.user;
      }
      return rejectWithValue(res.data.error || 'Login failed');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      return rejectWithValue(error.response?.data?.error || 'Login failed');
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
      })
      .addCase(fetchCurrentUser.rejected, (state) => {
        state.user = null;
        state.isAuthenticated = false;
        state.isLoading = false;
      })
      .addCase(loginUser.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.user = action.payload;
        state.isAuthenticated = true;
        state.isLoading = false;
        state.error = null;
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      .addCase(logoutUser.fulfilled, (state) => {
        state.user = null;
        state.isAuthenticated = false;
        state.isLoading = false;
      });
  },
});

export const { setSetupRequired, clearAuthError } = authSlice.actions;
export default authSlice.reducer;
