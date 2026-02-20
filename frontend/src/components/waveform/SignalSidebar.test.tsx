import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/preact';
import { SignalSidebar } from './SignalSidebar';

// Import signals directly from state files to allow setting values
import {
    allSignals,
    allSignalTypes,
    signalSearchQuery,
    signalIsRegex,
    signalTypeFilter,
    showChangedInView,
    signalsWithChanges,
    filterPresets,
} from '../../stores/waveform/state';

import {
    selectedSignals,
    focusedSignal
} from '../../stores/selectionStore';

// Mock the icons component
vi.mock('../icons', () => ({
    ChevronRightIcon: () => <span data-testid="chevron-icon">›</span>
}));

describe('SignalSidebar', () => {
    beforeEach(() => {
        // Reset all signals to default state
        allSignals.value = [];
        selectedSignals.value = [];
        signalSearchQuery.value = '';
        signalIsRegex.value = false;
        signalTypeFilter.value = 'all';
        showChangedInView.value = false;
        signalsWithChanges.value = new Set();
        filterPresets.value = [];
        allSignalTypes.value = new Map();
        focusedSignal.value = null;
    });

    describe('Rendering', () => {
        it('renders empty state when no signals available', () => {
            render(<SignalSidebar />);
            
            expect(screen.getByText('Signals')).toBeInTheDocument();
            expect(screen.getByPlaceholderText('Filter signals...')).toBeInTheDocument();
            expect(screen.getByText('No signals available.')).toBeInTheDocument();
            expect(screen.getByText('Load a log file to see available signals')).toBeInTheDocument();
        });

        it('renders device groups with signals', () => {
            allSignals.value = ['Device1::Signal1', 'Device1::Signal2', 'Device2::Signal3'];

            render(<SignalSidebar />);

            expect(screen.getByText('Device1')).toBeInTheDocument();
            expect(screen.getByText('Device2')).toBeInTheDocument();
        });

        it('shows device count correctly', () => {
            allSignals.value = ['Device1::Signal1', 'Device1::Signal2', 'Device1::Signal3'];

            render(<SignalSidebar />);

            expect(screen.getByText('0/3')).toBeInTheDocument();
        });
    });

    describe('Signal Search', () => {
        it('filters signals by search query', async () => {
            allSignals.value = [
                'Device1::Temperature',
                'Device1::Pressure',
                'Device1::FlowRate',
                'Device2::MotorSpeed',
                'Device2::ValveState'
            ];

            render(<SignalSidebar />);

            // Initially both devices should be visible
            expect(screen.getByText('Device1')).toBeInTheDocument();
            expect(screen.getByText('Device2')).toBeInTheDocument();

            // Search for "Temp"
            const searchInput = screen.getByPlaceholderText('Filter signals...');
            fireEvent.input(searchInput, { target: { value: 'Temp' } });

            await waitFor(() => {
                // Only Device1 with Temperature should be visible
                expect(screen.queryByText('Device2')).not.toBeInTheDocument();
            });
        });

        it('toggles regex mode', () => {
            render(<SignalSidebar />);

            const regexToggle = screen.getByText('.*');
            expect(regexToggle).not.toHaveClass('active');

            fireEvent.click(regexToggle);

            expect(signalIsRegex.value).toBe(true);
        });
    });

    describe('Signal Type Filter', () => {
        it('filters by signal type', () => {
            allSignals.value = ['Device1::BoolSignal', 'Device1::StringSignal'];
            allSignalTypes.value = new Map([
                ['Device1::BoolSignal', 'boolean'],
                ['Device1::StringSignal', 'string']
            ]);

            render(<SignalSidebar />);

            const typeSelect = screen.getByDisplayValue('All Types');
            fireEvent.change(typeSelect, { target: { value: 'boolean' } });

            expect(signalTypeFilter.value).toBe('boolean');
        });
    });

    describe('Signal Selection', () => {
        it('toggles signal selection on checkbox click', () => {
            allSignals.value = ['Device1::Signal1', 'Device1::Signal2'];

            render(<SignalSidebar />);

            // Expand device
            fireEvent.click(screen.getByText('Device1'));

            // Click on Signal1 checkbox
            const checkboxes = screen.getAllByRole('checkbox');
            // First checkbox is device checkbox, subsequent ones are signal checkboxes
            fireEvent.click(checkboxes[1]); // First signal checkbox

            expect(selectedSignals.value).toContain('Device1::Signal1');
        });

        // Note: Device selection tests are covered in E2E: e2e/canvas-interactions.spec.ts

        it('shows partial selection state', () => {
            allSignals.value = ['Device1::Signal1', 'Device1::Signal2'];
            selectedSignals.value = ['Device1::Signal1']; // Select only one

            render(<SignalSidebar />);

            // Note: indeterminate is set via ref callback, which may not work in test env
            // We verify partial selection by checking the count display
            expect(screen.getByText('1/2')).toBeInTheDocument();
        });
    });

    describe('Device Expansion', () => {
        it('expands/collapses device on click', () => {
            allSignals.value = ['Device1::Signal1', 'Device1::Signal2'];

            render(<SignalSidebar />);

            // Initially collapsed - signals not visible
            expect(screen.queryByText('Signal1')).not.toBeInTheDocument();

            // Click to expand
            fireEvent.click(screen.getByText('Device1'));

            // Signals now visible
            expect(screen.getByText('Signal1')).toBeInTheDocument();
            expect(screen.getByText('Signal2')).toBeInTheDocument();

            // Click to collapse
            fireEvent.click(screen.getByText('Device1'));

            // Signals hidden again
            expect(screen.queryByText('Signal1')).not.toBeInTheDocument();
        });

        it('auto-expands all devices when searching', async () => {
            allSignals.value = [
                'Device1::Temperature',
                'Device2::Pressure'
            ];

            render(<SignalSidebar />);

            // Type in search
            const searchInput = screen.getByPlaceholderText('Filter signals...');
            fireEvent.input(searchInput, { target: { value: 'Temp' } });

            // Matching signals should be visible
            await waitFor(() => {
                expect(screen.getByText('Temperature')).toBeInTheDocument();
            });
        });
    });

    describe('Focus Signal', () => {
        it('sets focused signal on click', () => {
            allSignals.value = ['Device1::Signal1'];

            render(<SignalSidebar />);

            // Expand and click on signal
            fireEvent.click(screen.getByText('Device1'));
            fireEvent.click(screen.getByText('Signal1'));

            expect(focusedSignal.value).toBe('Device1::Signal1');
        });
    });

    describe('Context Menu', () => {
        it('shows context menu on right click', () => {
            allSignals.value = ['Device1::Signal1'];

            render(<SignalSidebar />);

            // Expand and right-click on signal
            fireEvent.click(screen.getByText('Device1'));
            const signalElement = screen.getByText('Signal1');
            fireEvent.contextMenu(signalElement);

            expect(screen.getByText('Hide Signal')).toBeInTheDocument();
            expect(screen.getByText('Show Only This')).toBeInTheDocument();
            expect(screen.getByText('Cancel')).toBeInTheDocument();
        });

        it('hides signal via context menu', () => {
            allSignals.value = ['Device1::Signal1', 'Device1::Signal2'];
            selectedSignals.value = ['Device1::Signal1', 'Device1::Signal2'];

            render(<SignalSidebar />);

            // Right-click and hide
            fireEvent.click(screen.getByText('Device1'));
            const signalElement = screen.getByText('Signal1');
            fireEvent.contextMenu(signalElement);
            fireEvent.click(screen.getByText('Hide Signal'));

            expect(selectedSignals.value).not.toContain('Device1::Signal1');
        });

        it('shows only selected signal via context menu', () => {
            allSignals.value = ['Device1::Signal1', 'Device1::Signal2'];
            selectedSignals.value = ['Device1::Signal1', 'Device1::Signal2'];

            render(<SignalSidebar />);

            // Right-click and show only
            fireEvent.click(screen.getByText('Device1'));
            const signalElement = screen.getByText('Signal1');
            fireEvent.contextMenu(signalElement);
            fireEvent.click(screen.getByText('Show Only This'));

            expect(selectedSignals.value).toHaveLength(1);
            expect(selectedSignals.value).toContain('Device1::Signal1');
        });
    });

    describe('Filter Presets', () => {
        it('shows save preset dialog', () => {
            render(<SignalSidebar />);

            const saveBtn = screen.getByTitle('Save Preset');
            fireEvent.click(saveBtn);

            expect(screen.getByPlaceholderText('Preset name...')).toBeInTheDocument();
        });

        it('lists available presets', () => {
            filterPresets.value = [
                { name: 'Test Preset', searchQuery: 'Signal1', isRegex: false, typeFilter: 'all', showChangedInView: false }
            ];

            render(<SignalSidebar />);

            expect(screen.getByText('Load Preset...')).toBeInTheDocument();
        });
    });

    describe('Show Changed Filter', () => {
        it('toggles show changed filter', () => {
            allSignals.value = ['Device1::Signal1', 'Device1::Signal2'];
            signalsWithChanges.value = new Set(['Device1::Signal1']);

            render(<SignalSidebar />);

            const checkbox = screen.getByLabelText('Show signals with changes in view');
            fireEvent.click(checkbox);

            expect(showChangedInView.value).toBe(true);
        });
    });

    describe('Actions', () => {
        it('deselects all signals', () => {
            allSignals.value = ['Device1::Signal1', 'Device1::Signal2'];
            selectedSignals.value = ['Device1::Signal1', 'Device1::Signal2'];

            render(<SignalSidebar />);

            const noneBtn = screen.getByTitle('Deselect All Signals');
            fireEvent.click(noneBtn);

            expect(selectedSignals.value).toHaveLength(0);
        });
    });
});
