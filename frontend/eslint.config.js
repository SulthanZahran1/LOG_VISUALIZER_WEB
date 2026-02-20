import js from '@eslint/js'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
    js.configs.recommended,
    {
        files: ['src/**/*.{ts,tsx}'],
        languageOptions: {
            parser: tsparser,
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
                ecmaFeatures: {
                    jsx: true,
                },
            },
            globals: {
                window: 'readonly',
                document: 'readonly',
                navigator: 'readonly',
                console: 'readonly',
                fetch: 'readonly',
                HTMLElement: 'readonly',
                HTMLInputElement: 'readonly',
                HTMLDivElement: 'readonly',
                HTMLCanvasElement: 'readonly',
                HTMLSelectElement: 'readonly',
                CanvasRenderingContext2D: 'readonly',
                File: 'readonly',
                FileReader: 'readonly',
                Blob: 'readonly',
                FormData: 'readonly',
                RequestInit: 'readonly',
                Event: 'readonly',
                MouseEvent: 'readonly',
                WheelEvent: 'readonly',
                DragEvent: 'readonly',
                KeyboardEvent: 'readonly',
                FocusEvent: 'readonly',
                ResizeObserver: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                requestAnimationFrame: 'readonly',
                AbortController: 'readonly',
                AbortSignal: 'readonly',
                EventSource: 'readonly',
                CompressionStream: 'readonly',
                DecompressionStream: 'readonly',
                Response: 'readonly',
                localStorage: 'readonly',
                atob: 'readonly',
                btoa: 'readonly',
                TextEncoder: 'readonly',
                Worker: 'readonly',
                URL: 'readonly',
                WebSocket: 'readonly',
                Node: 'readonly',
                DOMRect: 'readonly',
                HTMLButtonElement: 'readonly',
                React: 'readonly',
            },
        },
        plugins: {
            '@typescript-eslint': tseslint,
            'react-hooks': reactHooks,
        },
        rules: {
            // TypeScript rules
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            '@typescript-eslint/no-explicit-any': 'warn',

            // React Hooks rules
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn',

            // General rules
            'no-console': ['warn', { allow: ['warn', 'error'] }],
            'no-unused-vars': 'off', // Handled by TypeScript
            'no-redeclare': 'off', // TypeScript handles this correctly (const + type)
        },
    },
    // Worker files - separate globals config
    {
        files: ['src/workers/**/*.{ts,js}'],
        languageOptions: {
            globals: {
                self: 'readonly',
                MessageEvent: 'readonly',
                TextEncoder: 'readonly',
                console: 'readonly',
                clearTimeout: 'readonly',
                setTimeout: 'readonly',
            },
        },
        rules: {
            'no-case-declarations': 'off',
        },
    },
    {
        ignores: [
            'dist/**',
            'node_modules/**',
            '*.config.ts',
            '*.config.js',
            'e2e/**',
        ],
    },
]
