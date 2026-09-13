import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../api/client';
import { UserDto } from '@rdp/shared';

interface UserState {
  users: UserDto[];
  isLoading: boolean;
  error: string | null;
}

const initialState: UserState = {
  users: [],
  isLoading: false,
  error: null,
};

export const fetchUsers = createAsyncThunk('users/fetchUsers', async () => {
  const res = await api.get('/users');
  return res.data.data;
});

export const createUser = createAsyncThunk('users/createUser', async (userData: Record<string, unknown>, { rejectWithValue }) => {
  try {
    const res = await api.post('/users', userData);
    return res.data.data;
  } catch (err: unknown) {
    const error = err as { response?: { data?: { error?: string } } };
    return rejectWithValue(error.response?.data?.error || 'Failed to create user');
  }
});

export const updateUser = createAsyncThunk('users/updateUser', async ({ id, data }: { id: string; data: Record<string, unknown> }, { rejectWithValue }) => {
  try {
    const res = await api.put(`/users/${id}`, data);
    return res.data.data;
  } catch (err: unknown) {
    const error = err as { response?: { data?: { error?: string } } };
    return rejectWithValue(error.response?.data?.error || 'Failed to update user');
  }
});

export const deleteUser = createAsyncThunk('users/deleteUser', async (id: string, { rejectWithValue }) => {
  try {
    await api.delete(`/users/${id}`);
    return id;
  } catch (err: unknown) {
    const error = err as { response?: { data?: { error?: string } } };
    return rejectWithValue(error.response?.data?.error || 'Failed to delete user');
  }
});

const userSlice = createSlice({
  name: 'users',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchUsers.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(fetchUsers.fulfilled, (state, action) => {
        state.users = action.payload;
        state.isLoading = false;
      })
      .addCase(fetchUsers.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to fetch users';
      })
      .addCase(createUser.fulfilled, (state, action) => {
        state.users.unshift(action.payload);
      })
      .addCase(updateUser.fulfilled, (state, action) => {
        const index = state.users.findIndex((u) => u.id === action.payload.id);
        if (index !== -1) {
          state.users[index] = action.payload;
        }
      })
      .addCase(deleteUser.fulfilled, (state, action) => {
        state.users = state.users.filter((u) => u.id !== action.payload);
      });
  },
});

export default userSlice.reducer;
