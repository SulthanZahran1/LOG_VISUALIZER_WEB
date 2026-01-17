import { signal } from '@preact/signals';

// Signal Selection State
// Key format: "DeviceId::SignalName"
export const selectedSignals = signal<string[]>([]);
export const focusedSignal = signal<string | null>(null);

// Helper to check if selected
export function isSignalSelected(deviceId: string, signalName: string): boolean {
    return selectedSignals.value.includes(`${deviceId}::${signalName}`);
}

// Helper to toggle
export function toggleSignal(deviceId: string, signalName: string) {
    const key = `${deviceId}::${signalName}`;
    if (selectedSignals.value.includes(key)) {
        selectedSignals.value = selectedSignals.value.filter(s => s !== key);
    } else {
        selectedSignals.value = [...selectedSignals.value, key];
    }
}
