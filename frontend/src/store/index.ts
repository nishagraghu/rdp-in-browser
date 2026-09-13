import { configureStore } from '@reduxjs/toolkit';
import authReducer from './authSlice';
import vmReducer from './vmSlice';
import userReducer from './userSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    vms: vmReducer,
    users: userReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
