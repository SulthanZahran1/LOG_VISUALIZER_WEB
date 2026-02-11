#!/usr/bin/env python3
"""
PLC Log Analyzer - Quick analysis of PLC log files
Usage: python analyze-log.py <logfile>
"""

import sys
import re
from collections import Counter
from datetime import datetime
import gzip

def read_log_file(filepath):
    """Read log file, handling gzip if needed."""
    if filepath.endswith('.gz'):
        with gzip.open(filepath, 'rt', encoding='utf-8', errors='ignore') as f:
            return f.readlines()
    else:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            return f.readlines()

def detect_format(lines):
    """Detect log file format."""
    if not lines:
        return "empty"
    
    sample = '\n'.join(lines[:10])
    
    # PLC Debug format
    if re.search(r'\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}', sample):
        return "plc_debug"
    
    # Tab-separated
    if '\t' in lines[0] and len(lines[0].split('\t')) > 3:
        return "tab_separated"
    
    # CSV
    if ',' in lines[0] and len(lines[0].split(',')) > 3:
        return "csv"
    
    # MCS/AMHS format
    if re.search(r'\[.*\]', sample) and 'AMHS' in sample.upper():
        return "mcs_amhs"
    
    return "unknown"

def analyze_plc_debug(lines):
    """Analyze PLC debug format logs."""
    print("Format: PLC Debug")
    print("-" * 50)
    
    timestamps = []
    devices = Counter()
    signals = Counter()
    
    # Pattern: 2024-01-15 10:30:45.123 [DEV-001] SignalName = Value
    pattern = r'(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[\.\d]*)\s+\[([^\]]+)\]\s+(\w+)'
    
    for line in lines:
        match = re.search(pattern, line)
        if match:
            ts, device, signal = match.groups()
            timestamps.append(ts)
            devices[device] += 1
            signals[signal] += 1
    
    print(f"Total entries: {len(timestamps)}")
    
    if timestamps:
        print(f"Time range: {timestamps[0]} to {timestamps[-1]}")
        
        # Try to parse duration
        try:
            start = datetime.strptime(timestamps[0][:19], '%Y-%m-%d %H:%M:%S')
            end = datetime.strptime(timestamps[-1][:19], '%Y-%m-%d %H:%M:%S')
            duration = end - start
            print(f"Duration: {duration}")
        except:
            pass
    
    print(f"\nTop 10 Devices:")
    for device, count in devices.most_common(10):
        print(f"  {device}: {count} entries")
    
    print(f"\nTop 10 Signals:")
    for signal, count in signals.most_common(10):
        print(f"  {signal}: {count} entries")

def analyze_csv(lines):
    """Analyze CSV format logs."""
    print("Format: CSV")
    print("-" * 50)
    
    if not lines:
        return
    
    header = lines[0].strip().split(',')
    print(f"Columns: {len(header)}")
    print(f"Headers: {', '.join(header[:5])}{'...' if len(header) > 5 else ''}")
    print(f"Data rows: {len(lines) - 1}")

def analyze_tab(lines):
    """Analyze tab-separated logs."""
    print("Format: Tab-Separated")
    print("-" * 50)
    
    if not lines:
        return
    
    cols = lines[0].strip().split('\t')
    print(f"Columns: {len(cols)}")
    print(f"Data rows: {len(lines)}")

def main():
    if len(sys.argv) < 2:
        print("Usage: python analyze-log.py <logfile>")
        print("")
        print("Analyzes PLC log files and provides summary statistics.")
        print("Supports: PLC Debug, CSV, Tab-separated, MCS/AMHS formats")
        sys.exit(1)
    
    filepath = sys.argv[1]
    
    print(f"Analyzing: {filepath}")
    print("=" * 50)
    
    try:
        lines = read_log_file(filepath)
    except Exception as e:
        print(f"Error reading file: {e}")
        sys.exit(1)
    
    file_size = len(''.join(lines))
    print(f"File size: {file_size:,} characters")
    print(f"Lines: {len(lines):,}")
    print("")
    
    # Detect format
    format_type = detect_format(lines)
    
    if format_type == "plc_debug":
        analyze_plc_debug(lines)
    elif format_type == "csv":
        analyze_csv(lines)
    elif format_type == "tab_separated":
        analyze_tab(lines)
    elif format_type == "empty":
        print("File is empty")
    else:
        print(f"Format: {format_type}")
        print("-" * 50)
        print("First 3 lines:")
        for i, line in enumerate(lines[:3]):
            print(f"  {i+1}: {line.strip()[:80]}")

if __name__ == '__main__':
    main()
