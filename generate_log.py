
import datetime
import random

def generate_large_log(filename, target_size_mb):
    target_size_bytes = target_size_mb * 1024 * 1024
    current_size = 0
    
    devices = ["SYSTEM/LINE1/DEV-101", "SYSTEM/LINE1/DEV-102", "SYSTEM/LINE1/DEV-103", "SYSTEM/LINE1/DEV-104"]
    signals = [
        ("INPUT:Temperature", "Integer", lambda: str(random.randint(10, 50))),
        ("INPUT:Counter", "Integer", lambda: str(random.randint(0, 1000))),
        ("INPUT:Mode", "String", lambda: random.choice(["RUNNING", "STOPPED", "ERROR", "STOPPING"])),
        ("INPUT:Sensor_A", "Boolean", lambda: random.choice(["ON", "OFF"])),
        ("INPUT:Pressure", "Integer", lambda: str(random.randint(50, 150))),
        ("INPUT:Motor_Running", "Boolean", lambda: random.choice(["ON", "OFF"])),
        ("INPUT:System_State", "String", lambda: random.choice(["OK", "WARNING", "ERROR"]))
    ]
    
    start_time = datetime.datetime(2025, 9, 22, 13, 0, 0)
    line_count = 0
    
    with open(filename, 'w') as f:
        while current_size < target_size_bytes:
            device = random.choice(devices)
            signal_name, signal_type, signal_val_func = random.choice(signals)
            val = signal_val_func()
            
            # Increment time by a few milliseconds
            elapsed = datetime.timedelta(milliseconds=line_count * 10)
            current_time = start_time + elapsed
            timestamp = current_time.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
            
            line = f"{timestamp} [Info] [{device}] [{signal_name}] ({signal_type}) : {val}\n"
            f.write(line)
            current_size += len(line)
            line_count += 1
            
            if line_count % 10000 == 0:
                print(f"Generated {current_size / (1024*1024):.2f} MB...")

    print(f"Done! Created {filename} ({current_size / (1024*1024):.2f} MB)")

if __name__ == "__main__":
    generate_large_log("large_test.log", 100)
