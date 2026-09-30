import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'

export type ToastType = 'success' | 'error' | 'info'

export interface ToastItem {
  id: string
  message: string
  type: ToastType
}

interface ToastStore {
  toasts: ToastItem[]
  addToast: (message: string, type?: ToastType) => void
  removeToast: (id: string) => void
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (message, type = 'success') => {
    const id = uuidv4()
    set((state) => ({ toasts: [...state.toasts, { id, message, type }] }))
    // Errors explain what went wrong, so they stay long enough to read
    const duration = type === 'error' ? 8000 : type === 'info' ? 6000 : 3500
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
    }, duration)
  },
  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}))

/** Imperative API — call from anywhere outside React */
export const toast = {
  success: (msg: string) => useToastStore.getState().addToast(msg, 'success'),
  error:   (msg: string) => useToastStore.getState().addToast(msg, 'error'),
  info:    (msg: string) => useToastStore.getState().addToast(msg, 'info'),
}
