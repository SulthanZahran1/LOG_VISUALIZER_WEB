import { render, screen } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { TransitionStats } from './TransitionStats';
import type { TransitionStats as Stats } from '../../stores/transitionStore';

function createStats(): Stats {
    return {
        configName: 'Cell Cycle',
        count: 12,
        min: 900,
        max: 2200,
        average: 1400,
        median: 1300,
        p90: 2000,
        p95: 2150,
        stdDev: 250,
        range: 1300,
        cv: 0.1786,
        totalDuration: 16_800,
        firstStartTime: 1000,
        lastEndTime: 90_000,
        elapsedTime: 89_000,
        throughputPerHour: 485.4,
        targetLowerBound: 1200,
        targetUpperBound: 1800,
        withinTarget: 9,
        aboveTarget: 2,
        belowTarget: 1,
        withinTargetPct: 75,
        aboveTargetPct: 16.6667,
        belowTargetPct: 8.3333
    };
}

describe('TransitionStats', () => {
    it('renders expanded metrics sections', () => {
        render(<TransitionStats stats={createStats()} />);

        expect(screen.getByText('Operational Summary')).toBeInTheDocument();
        expect(screen.getByText('Distribution')).toBeInTheDocument();
        expect(screen.getByText('P95')).toBeInTheDocument();
        expect(screen.getByText('Throughput / h')).toBeInTheDocument();
        expect(screen.getByText('Target Window')).toBeInTheDocument();
        expect(screen.getByText('Target Compliance')).toBeInTheDocument();
    });

    it('shows empty state when stats are missing', () => {
        render(<TransitionStats stats={null} />);
        expect(screen.getByText('No statistics available. Configure and enable a transition to see results.')).toBeInTheDocument();
    });
});
