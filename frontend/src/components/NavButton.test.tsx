import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/preact'
import { NavButton } from '../components/layout/NavButton'

describe('NavButton', () => {
    it('renders with title and icon', () => {
        render(
            <NavButton
                title="Test Button"
                icon="waveform"
                onClick={() => { }}
            />
        )

        expect(screen.getByText('Test Button')).toBeInTheDocument()
    })

    it('renders description when provided', () => {
        render(
            <NavButton
                title="Test Button"
                icon="table"
                description="This is a description"
                onClick={() => { }}
            />
        )

        expect(screen.getByText('This is a description')).toBeInTheDocument()
    })

    it('applies disabled state correctly', () => {
        render(
            <NavButton
                title="Test Button"
                icon="map"
                disabled={true}
                onClick={() => { }}
            />
        )

        const button = screen.getByRole('button')
        expect(button).toBeDisabled()
    })

    it('applies active state correctly', () => {
        render(
            <NavButton
                title="Test Button"
                icon="chart"
                active={true}
                onClick={() => { }}
            />
        )

        const button = screen.getByRole('button')
        expect(button).toHaveClass('active')
    })

    it('calls onClick when clicked', async () => {
        let clicked = false
        render(
            <NavButton
                title="Test Button"
                icon="waveform"
                onClick={() => { clicked = true }}
            />
        )

        const button = screen.getByRole('button')
        button.click()

        expect(clicked).toBe(true)
    })

    it('does not call onClick when disabled', () => {
        let clicked = false
        render(
            <NavButton
                title="Test Button"
                icon="waveform"
                disabled={true}
                onClick={() => { clicked = true }}
            />
        )

        const button = screen.getByRole('button')
        button.click()

        expect(clicked).toBe(false)
    })
})
