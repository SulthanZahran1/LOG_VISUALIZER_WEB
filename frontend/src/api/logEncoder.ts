/**
 * Log-Specific Binary Encoder
 * 
 * Optimized for PLC log files which have high repetition:
 * - Same device IDs appear thousands of times
 * - Same signal names appear thousands of times
 * - Timestamps are sequential (delta encodable)
 * - Values often repeat (boolean states, status codes)
 * 
 * Format:
 * [Header]
 * [String Dictionary] - unique device IDs and signal names
 * [Entry Records] - binary records referencing dictionary
 * 
 * This typically achieves 80-95% size reduction before general compression.
 */

// Entry types
const enum ValueType {
    BOOL_FALSE = 0,
    BOOL_TRUE = 1,
    INT8 = 2,
    INT16 = 3,
    INT32 = 4,
    STRING_INDEX = 5,  // Reference to dictionary
    STRING_RAW = 6,    // Inline string
}

interface StringTable {
    strings: string[];
    index: Map<string, number>;
}

interface LogEntry {
    timestamp: number;
    deviceId: string;
    signalName: string;
    value: boolean | number | string;
    valueType: 'boolean' | 'integer' | 'string';
}

/**
 * Build string table from log entries
 * Only stores unique device IDs and signal names
 */
function buildStringTable(entries: LogEntry[]): StringTable {
    const table: StringTable = {
        strings: [],
        index: new Map()
    };

    for (const entry of entries) {
        // Add device ID if not present
        if (!table.index.has(entry.deviceId)) {
            table.index.set(entry.deviceId, table.strings.length);
            table.strings.push(entry.deviceId);
        }
        // Add signal name if not present
        if (!table.index.has(entry.signalName)) {
            table.index.set(entry.signalName, table.strings.length);
            table.strings.push(entry.signalName);
        }
        // Add string values if not present
        if (entry.valueType === 'string' && typeof entry.value === 'string') {
            if (!table.index.has(entry.value)) {
                table.index.set(entry.value, table.strings.length);
                table.strings.push(entry.value);
            }
        }
    }

    return table;
}

/**
 * Encode integer with variable length encoding
 * Small values use 1 byte, larger use 2-4 bytes
 */
function encodeVarInt(value: number): number[] {
    if (value < 128) {
        return [value];
    } else if (value < 16384) {
        return [(value >> 7) | 0x80, value & 0x7F];
    } else if (value < 2097152) {
        return [(value >> 14) | 0x80, ((value >> 7) | 0x80) & 0xFF, value & 0x7F];
    } else {
        return [
            (value >> 21) | 0x80,
            ((value >> 14) | 0x80) & 0xFF,
            ((value >> 7) | 0x80) & 0xFF,
            value & 0x7F
        ];
    }
}

/**
 * Encode timestamp delta
 * Most log entries are sequential with small deltas
 */
function encodeTimestampDelta(delta: number): number[] {
    // If delta fits in 16 bits, use 2 bytes
    if (delta >= 0 && delta < 65536) {
        return [delta >> 8, delta & 0xFF];
    }
    // Otherwise use 4 bytes with marker
    return [0xFF, (delta >> 24) & 0xFF, (delta >> 16) & 0xFF, (delta >> 8) & 0xFF, delta & 0xFF];
}

/**
 * Encode a single log entry
 */
function encodeEntry(
    entry: LogEntry,
    table: StringTable,
    prevTimestamp: number
): number[] {
    const bytes: number[] = [];

    // Encode timestamp delta (usually small for logs)
    const delta = entry.timestamp - prevTimestamp;
    bytes.push(...encodeTimestampDelta(delta));

    // Encode device ID index (varint)
    const deviceIdx = table.index.get(entry.deviceId)!;
    bytes.push(...encodeVarInt(deviceIdx));

    // Encode signal name index (varint)
    const signalIdx = table.index.get(entry.signalName)!;
    bytes.push(...encodeVarInt(signalIdx));

    // Encode value based on type
    if (entry.valueType === 'boolean') {
        bytes.push(entry.value ? ValueType.BOOL_TRUE : ValueType.BOOL_FALSE);
    } else if (entry.valueType === 'integer') {
        const intVal = entry.value as number;
        if (intVal >= -128 && intVal <= 127) {
            bytes.push(ValueType.INT8);
            bytes.push(intVal & 0xFF);
        } else if (intVal >= -32768 && intVal <= 32767) {
            bytes.push(ValueType.INT16);
            bytes.push((intVal >> 8) & 0xFF);
            bytes.push(intVal & 0xFF);
        } else {
            bytes.push(ValueType.INT32);
            bytes.push((intVal >> 24) & 0xFF);
            bytes.push((intVal >> 16) & 0xFF);
            bytes.push((intVal >> 8) & 0xFF);
            bytes.push(intVal & 0xFF);
        }
    } else {
        const strVal = entry.value as string;
        const strIdx = table.index.get(strVal);
        if (strIdx !== undefined) {
            bytes.push(ValueType.STRING_INDEX);
            bytes.push(...encodeVarInt(strIdx));
        } else {
            bytes.push(ValueType.STRING_RAW);
            const utf8 = new TextEncoder().encode(strVal);
            bytes.push(...encodeVarInt(utf8.length));
            bytes.push(...Array.from(utf8));
        }
    }

    return bytes;
}

/**
 * Encode string table
 */
function encodeStringTable(table: StringTable): number[] {
    const bytes: number[] = [];

    // Number of strings (varint)
    bytes.push(...encodeVarInt(table.strings.length));

    // Each string: length (varint) + UTF-8 bytes
    for (const str of table.strings) {
        const utf8 = new TextEncoder().encode(str);
        bytes.push(...encodeVarInt(utf8.length));
        bytes.push(...Array.from(utf8));
    }

    return bytes;
}

/**
 * Encode log entries to custom binary format
 * Returns Uint8Array ready for compression
 */
export function encodeLogEntries(entries: LogEntry[]): Uint8Array {
    if (entries.length === 0) {
        return new Uint8Array(0);
    }

    // Build string table
    const table = buildStringTable(entries);

    // Calculate output size (rough estimate)
    const estimatedSize = entries.length * 16 + table.strings.join('').length * 2;
    const bytes: number[] = [];

    // Magic number: "LLOG" (0x4C4C4F47 in LE)
    bytes.push(0x4C, 0x4C, 0x4F, 0x47);

    // Version
    bytes.push(1);

    // Reserved flags
    bytes.push(0);

    // Entry count (4 bytes, big-endian for readability)
    bytes.push((entries.length >> 24) & 0xFF);
    bytes.push((entries.length >> 16) & 0xFF);
    bytes.push((entries.length >> 8) & 0xFF);
    bytes.push(entries.length & 0xFF);

    // String table offset (will be 10, right after header)
    const tableOffset = 10;
    bytes.push((tableOffset >> 24) & 0xFF);
    bytes.push((tableOffset >> 16) & 0xFF);
    bytes.push((tableOffset >> 8) & 0xFF);
    bytes.push(tableOffset & 0xFF);

    // Encode string table
    const tableBytes = encodeStringTable(table);

    // Data offset
    const dataOffset = tableOffset + tableBytes.length;
    bytes.push((dataOffset >> 24) & 0xFF);
    bytes.push((dataOffset >> 16) & 0xFF);
    bytes.push((dataOffset >> 8) & 0xFF);
    bytes.push(dataOffset & 0xFF);

    // First timestamp (8 bytes, milliseconds since epoch)
    const firstTs = entries[0].timestamp;
    bytes.push((firstTs >> 56) & 0xFF);
    bytes.push((firstTs >> 48) & 0xFF);
    bytes.push((firstTs >> 40) & 0xFF);
    bytes.push((firstTs >> 32) & 0xFF);
    bytes.push((firstTs >> 24) & 0xFF);
    bytes.push((firstTs >> 16) & 0xFF);
    bytes.push((firstTs >> 8) & 0xFF);
    bytes.push(firstTs & 0xFF);

    // Append string table
    bytes.push(...tableBytes);

    // Encode entries with delta timestamps
    let prevTimestamp = firstTs;
    for (const entry of entries) {
        bytes.push(...encodeEntry(entry, table, prevTimestamp));
        prevTimestamp = entry.timestamp;
    }

    return new Uint8Array(bytes);
}

/**
 * Streaming log encoder for large files
 * Processes file in chunks to avoid memory issues
 */
export class StreamingLogEncoder {
    private stringTable = new Map<string, number>();
    private strings: string[] = [];
    private entries: LogEntry[] = [];
    private chunkSize: number;

    constructor(chunkSize = 10000) {
        this.chunkSize = chunkSize;
    }

    /**
     * Add a log entry to the current chunk
     */
    addEntry(entry: LogEntry): Uint8Array | null {
        // Add to string table
        if (!this.stringTable.has(entry.deviceId)) {
            this.stringTable.set(entry.deviceId, this.strings.length);
            this.strings.push(entry.deviceId);
        }
        if (!this.stringTable.has(entry.signalName)) {
            this.stringTable.set(entry.signalName, this.strings.length);
            this.strings.push(entry.signalName);
        }
        if (entry.valueType === 'string' && typeof entry.value === 'string') {
            if (!this.stringTable.has(entry.value)) {
                this.stringTable.set(entry.value, this.strings.length);
                this.strings.push(entry.value);
            }
        }

        this.entries.push(entry);

        // Flush when chunk is full
        if (this.entries.length >= this.chunkSize) {
            return this.flush();
        }

        return null;
    }

    /**
     * Encode current chunk and reset
     */
    flush(): Uint8Array {
        const result = encodeLogEntries(this.entries);
        this.entries = [];
        return result;
    }

    /**
     * Get current string table stats
     */
    getStats(): { uniqueStrings: number; bufferedEntries: number } {
        return {
            uniqueStrings: this.strings.length,
            bufferedEntries: this.entries.length
        };
    }
}

/**
 * Parse PLC debug log line (simplified parser for encoding)
 * Returns null if line doesn't match format
 */
export function parsePLCDebugLine(line: string): LogEntry | null {
    // Format: "YYYY-MM-DD HH:MM:SS.fff [Level] [path] [cat:signal] (dtype) : value"
    const match = line.match(
        /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+)\s+\[[^\]]+\]\s+\[([^\]]+)\]\s+\[([^:\]]+):([^\]]+)\]\s+\(([^)]+)\)\s*:\s*(.+)$/
    );

    if (!match) return null;

    const ts = new Date(match[1]).getTime();
    const path = match[2];
    // const category = match[3];
    const signal = match[4];
    const dtype = match[5].toLowerCase();
    const valueStr = match[6].trim();

    // Extract device ID from path
    const deviceMatch = path.match(/([A-Za-z0-9_-]+)(?:@[^\]]+)?$/);
    const deviceId = deviceMatch ? deviceMatch[1] : path;

    // Parse value
    let value: boolean | number | string;
    let valueType: 'boolean' | 'integer' | 'string';

    if (dtype === 'boolean') {
        value = valueStr.toUpperCase() === 'TRUE' || valueStr === '1' || valueStr.toUpperCase() === 'ON';
        valueType = 'boolean';
    } else if (dtype === 'integer') {
        value = parseInt(valueStr.replace(/[,_]/g, ''), 10);
        valueType = 'integer';
    } else {
        value = valueStr;
        valueType = 'string';
    }

    return {
        timestamp: ts,
        deviceId,
        signalName: signal,
        value,
        valueType
    };
}

/**
 * Calculate compression ratio for statistics
 */
export function calculateCompressionRatio(originalSize: number, encodedSize: number): string {
    const ratio = ((1 - encodedSize / originalSize) * 100).toFixed(1);
    return `${ratio}% (${(originalSize / 1024 / 1024).toFixed(2)}MB → ${(encodedSize / 1024 / 1024).toFixed(2)}MB)`;
}
