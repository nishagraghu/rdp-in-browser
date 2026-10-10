import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import api from '../api/client';
import { VmDto } from '@rdp/shared';

/** Keep the full-screen connection scheme until RDP is up, then wait this long before revealing the session UI. */
export const VM_CONNECTION_REVEAL_DELAY_MS = 2000;

interface VmState {
  vms: VmDto[];
  currentVm: VmDto | null;
  isLoading: boolean;
  error: string | null;
  connectingVm: { id: string; name: string; startedAt: number } | null;
}

const initialState: VmState = {
  vms: [],
  currentVm: null,
  isLoading: false,
  error: null,
  connectingVm: null,
};

export const fetchVms = createAsyncThunk('vms/fetchVms', async () => {
  const res = await api.get('/vms');
  return res.data.data;
});

export const fetchVmById = createAsyncThunk('vms/fetchVmById', async (id: string) => {
  const res = await api.get(`/vms/${id}`);
  return res.data.data;
});

export const createVm = createAsyncThunk('vms/createVm', async (vmData: Record<string, unknown>, { rejectWithValue }) => {
  try {
    const res = await api.post('/vms', vmData);
    return res.data.data;
  } catch (err: unknown) {
    const error = err as { response?: { data?: { error?: string } } };
    return rejectWithValue(error.response?.data?.error || 'Failed to create VM');
  }
});

export const updateVm = createAsyncThunk('vms/updateVm', async ({ id, data }: { id: string; data: Record<string, unknown> }, { rejectWithValue }) => {
  try {
    const res = await api.put(`/vms/${id}`, data);
    return res.data.data;
  } catch (err: unknown) {
    const error = err as { response?: { data?: { error?: string } } };
    return rejectWithValue(error.response?.data?.error || 'Failed to update VM');
  }
});

export const deleteVm = createAsyncThunk('vms/deleteVm', async (id: string, { rejectWithValue }) => {
  try {
    await api.delete(`/vms/${id}`);
    return id;
  } catch (err: unknown) {
    const error = err as { response?: { data?: { error?: string } } };
    return rejectWithValue(error.response?.data?.error || 'Failed to delete VM');
  }
});

const vmSlice = createSlice({
  name: 'vms',
  initialState,
  reducers: {
    clearVmError(state) {
      state.error = null;
    },
    startVmConnection(state, action: PayloadAction<{ id: string; name: string }>) {
      const existing = state.connectingVm;
      state.connectingVm = {
        ...action.payload,
        startedAt:
          existing?.id === action.payload.id ? existing.startedAt : Date.now(),
      };
    },
    endVmConnection(state) {
      state.connectingVm = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchVms.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(fetchVms.fulfilled, (state, action) => {
        state.vms = action.payload;
        state.isLoading = false;
      })
      .addCase(fetchVms.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to load VMs';
      })
      .addCase(fetchVmById.fulfilled, (state, action) => {
        state.currentVm = action.payload;
      })
      .addCase(createVm.fulfilled, (state, action) => {
        state.vms.unshift(action.payload);
      })
      .addCase(updateVm.fulfilled, (state, action) => {
        const index = state.vms.findIndex((v) => v.id === action.payload.id);
        if (index !== -1) {
          state.vms[index] = action.payload;
        }
      })
      .addCase(deleteVm.fulfilled, (state, action) => {
        state.vms = state.vms.filter((v) => v.id !== action.payload);
      });
  },
});

export const { clearVmError, startVmConnection, endVmConnection } = vmSlice.actions;
export default vmSlice.reducer;
