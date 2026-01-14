import { describe, it, expect } from 'vitest'
import { formatTimestamp, getTickIntervals } from '../utils/TimeAxisUtils'

describe('TimeAxisUtils', () => {
    describe('formatTimestamp', () => {
        it('formats midnight correctly', () => {
            expect(formatTimestamp(0)).toBe('00:00:00.000')
        })

        it('formats milliseconds correctly', () => {
            expect(formatTimestamp(123)).toBe('00:00:00.123')
        })

        it('formats seconds correctly', () => {
            expect(formatTimestamp(5000)).toBe('00:00:05.000')
        })

        it('formats minutes correctly', () => {
            expect(formatTimestamp(65000)).toBe('00:01:05.000')
        })

        it('formats hours correctly', () => {
            expect(formatTimestamp(3665123)).toBe('01:01:05.123')
        })

        it('pads single digit values', () => {
            expect(formatTimestamp(3723001)).toBe('01:02:03.001')
        })
    })

    describe('getTickIntervals', () => {
        it('returns array with major and minor intervals', () => {
            const result = getTickIntervals(1)
            expect(result).toHaveLength(2)
            expect(result[1]).toBe(result[0] / 5)
        })

        it('returns smaller intervals at high zoom (more pixels per ms)', () => {
            const highZoom = getTickIntervals(10) // 10 pixels per ms
            const lowZoom = getTickIntervals(0.01) // 0.01 pixels per ms
            expect(highZoom[0]).toBeLessThan(lowZoom[0])
        })

        it('returns valid intervals from common list', () => {
            const commonIntervals = [
                1, 2, 5, 10, 20, 50, 100, 200, 500,
                1000, 2000, 5000, 10000, 30000,
                60000, 300000, 600000, 1800000, 3600000
            ]

            const [major] = getTickIntervals(0.5)
            expect(commonIntervals).toContain(major)
        })
    })
})
