#!/usr/bin/env tsx
/**
 * Large Log File Fixture Generator
 * 
 * This script generates a large log file with >100k entries for testing
 * server-side filtering and pagination in the Log Table.
 * 
 * Usage:
 *   npx tsx generate-large-fixture.ts [entry_count] [output_file]
 * 
 * Default: 150,000 entries -> large_test.log
 */

import * as fs from 'fs'
import * as path from 'path'

const ENTRY_COUNT = parseInt(process.argv[2] || '150000', 10)
const OUTPUT_FILE = process.argv[3] || path.join(__dirname, '..', '..', 'large_test.log')

// Sample devices and signals for variety
const DEVICES = [
    'SYSTEM/LINE1/DEV-101',
    'SYSTEM/LINE1/DEV-102',
    'SYSTEM/LINE1/DEV-103',
    'SYSTEM/LINE1/DEV-104',
    'SYSTEM/LINE2/DEV-201',
    'SYSTEM/LINE2/DEV-202',
    'SYSTEM/LINE2/DEV-203',
    'SYSTEM/LINE2/DEV-204',
    'SYSTEM/LINE3/DEV-301',
    'SYSTEM/LINE3/DEV-302',
]

const SIGNALS = [
    { name: 'Motor_Running', type: 'Boolean', values: ['ON', 'OFF'] },
    { name: 'Mode', type: 'String', values: ['STARTING', 'RUNNING', 'STOPPING', 'STOPPED', 'MAINTENANCE', 'ERROR'] },
    { name: 'Sensor_A', type: 'Boolean', values: ['ON', 'OFF'] },
    { name: 'Sensor_B', type: 'Boolean', values: ['ON', 'OFF'] },
    { name: 'Temperature', type: 'Integer', values: Array.from({ length: 50 }, (_, i) => String(i + 10)) },
    { name: 'Pressure', type: 'Float', values: ['1.5', '2.3', '3.1', '4.2', '5.0', '6.8', '7.5', '8.2', '9.1', '10.0'] },
    { name: 'Door_Open', type: 'Boolean', values: ['ON', 'OFF'] },
    { name: 'Emergency_Stop', type: 'Boolean', values: ['ON', 'OFF'] },
    { name: 'System_State', type: 'String', values: ['INIT', 'READY', 'ACTIVE', 'PAUSED', 'ERROR', 'SHUTDOWN'] },
    { name: 'Alarm_Level', type: 'Integer', values: ['0', '1', '2', '3', '4', '5'] },
]

const CATEGORIES = ['Info', 'Warning', 'Error', 'Debug', 'Critical']

function generateEntry(index: number, baseTime: Date): string {
    // Time increments by ~100ms per entry for realistic spread
    const timestamp = new Date(baseTime.getTime() + index * 100)
    const timeStr = timestamp.toISOString().replace('T', ' ').slice(0, 23)

    // Cycle through devices and signals
    const device = DEVICES[index % DEVICES.length]
    const signalConfig = SIGNALS[index % SIGNALS.length]
    const signalName = signalConfig.name
    const signalType = signalConfig.type
    const value = signalConfig.values[index % signalConfig.values.length]
    
    // Category based on signal and randomness
    let category = CATEGORIES[0] // Default Info
    if (signalName === 'Emergency_Stop' && value === 'ON') {
        category = CATEGORIES[4] // Critical
    } else if (signalName === 'Alarm_Level' && parseInt(value) > 3) {
        category = CATEGORIES[4] // Critical
    } else if (signalName === 'System_State' && value === 'ERROR') {
        category = CATEGORIES[2] // Error
    } else if (index % 50 === 0) {
        category = CATEGORIES[1] // Warning
    } else if (index % 100 === 0) {
        category = CATEGORIES[3] // Debug
    }

    return `${timeStr} [${category}] [${device}] [INPUT:${signalName}] (${signalType}) : ${value}`
}

async function generateFile() {
    console.log(`Generating ${ENTRY_COUNT.toLocaleString()} log entries...`)
    console.log(`Output: ${OUTPUT_FILE}`)

    const startTime = Date.now()
    const baseTime = new Date('2025-09-22T13:00:00.000Z')
    
    const writeStream = fs.createWriteStream(OUTPUT_FILE)
    
    // Write entries in batches for memory efficiency
    const BATCH_SIZE = 10000
    let written = 0

    for (let batch = 0; batch < Math.ceil(ENTRY_COUNT / BATCH_SIZE); batch++) {
        const batchStart = batch * BATCH_SIZE
        const batchEnd = Math.min(batchStart + BATCH_SIZE, ENTRY_COUNT)
        const lines: string[] = []

        for (let i = batchStart; i < batchEnd; i++) {
            lines.push(generateEntry(i, baseTime))
        }

        writeStream.write(lines.join('\n') + '\n')
        written += lines.length

        if ((batch + 1) % 5 === 0 || batchEnd >= ENTRY_COUNT) {
            const progress = ((batchEnd / ENTRY_COUNT) * 100).toFixed(1)
            console.log(`  Progress: ${progress}% (${written.toLocaleString()} entries)`)
        }
    }

    writeStream.end()

    await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', resolve)
        writeStream.on('error', reject)
    })

    const elapsed = Date.now() - startTime
    const stats = fs.statSync(OUTPUT_FILE)
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2)

    console.log(`\nDone!`)
    console.log(`  Entries: ${written.toLocaleString()}`)
    console.log(`  Size: ${sizeMB} MB`)
    console.log(`  Time: ${(elapsed / 1000).toFixed(2)}s`)
    console.log(`  Output: ${OUTPUT_FILE}`)
}

generateFile().catch(err => {
    console.error('Error:', err)
    process.exit(1)
})
