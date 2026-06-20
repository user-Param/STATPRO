#!/usr/bin/env python3
import subprocess, os, time, signal

PROJECT = "/Users/param/Documents/STATPRO"
LOG = f"{PROJECT}/logs"

def run(cmd, cwd=None):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=cwd)
    print(r.stdout)
    if r.returncode != 0:
        print("STDERR:", r.stderr)
    return r

def kill_port(port):
    r = subprocess.run(f"lsof -ti:{port}", shell=True, capture_output=True, text=True)
    for pid in r.stdout.strip().split():
        if not pid:
            continue
        try:
            os.kill(int(pid), signal.SIGKILL)
            print(f"  killed PID {pid} on port {port}")
        except ProcessLookupError:
            print(f"  PID {pid} on port {port} already exited")
        except PermissionError:
            print(f"  ERROR: no permission to kill PID {pid} on port {port}")
        except (ValueError, OSError) as e:
            print(f"  ERROR: failed to kill PID {pid} on port {port}: {e}")

def kill_name(name):
    r = subprocess.run(f"pgrep -f {name}", shell=True, capture_output=True, text=True)
    for pid in r.stdout.strip().split():
        if not pid:
            continue
        try:
            os.kill(int(pid), signal.SIGKILL)
            print(f"  killed {name} PID {pid}")
        except ProcessLookupError:
            print(f"  {name} PID {pid} already exited")
        except PermissionError:
            print(f"  ERROR: no permission to kill {name} PID {pid}")
        except (ValueError, OSError) as e:
            print(f"  ERROR: failed to kill {name} PID {pid}: {e}")

print("=== Stopping all STATPRO services ===")
kill_port(9000)
kill_port(9001)
kill_port(5001)
kill_name("dadapter")
kill_name("engine")
kill_name("executor")
kill_name("research_executor")
time.sleep(2)

print("\n=== Building datafeed ===")
r = run("make -j4", cwd=f"{PROJECT}/datafeed/build")
if r.returncode != 0:
    print("ERROR: Datafeed build failed! Aborting.")
    exit(1)

print("\n=== Building engine ===")
r = run("make -j4", cwd=f"{PROJECT}/engine/build")
if r.returncode != 0:
    print("ERROR: Engine build failed! Aborting.")
    exit(1)

print("\n=== Starting services ===")

# 1. Datafeed
df_log = open(f"{LOG}/datafeed.log", "w")
p1 = subprocess.Popen(
    [f"{PROJECT}/datafeed/build/datafeed", "0.0.0.0", "9000", "4"],
    stdout=df_log, stderr=df_log
)
print(f"  datafeed PID: {p1.pid}")
time.sleep(1)

# 2. Dadapter
da_log = open(f"{LOG}/adapter.log", "w")
p2 = subprocess.Popen(
    [f"{PROJECT}/datafeed/build/dadapter"],
    stdout=da_log, stderr=da_log
)
print(f"  dadapter PID: {p2.pid}")
time.sleep(1)

# 3. Executor
ex_log = open(f"{LOG}/executor.log", "w")
p3 = subprocess.Popen(
    [f"{PROJECT}/executor/build/executor"],
    stdout=ex_log, stderr=ex_log
)
print(f"  executor PID: {p3.pid}")
time.sleep(2)

# 4. Engine
en_log = open(f"{LOG}/engine.log", "w")
p4 = subprocess.Popen(
    [f"{PROJECT}/engine/build/engine"],
    stdout=en_log, stderr=en_log
)
print(f"  engine PID: {p4.pid}")
time.sleep(2)

# 5. Research backend
re_log = open(f"{LOG}/research.log", "w")
p5 = subprocess.Popen(
    ["python3", f"{PROJECT}/research_executor.py"],
    stdout=re_log, stderr=re_log,
    cwd=PROJECT
)
print(f"  research PID: {p5.pid}")

print("\n=== All services started. Waiting 4s for startup... ===")
time.sleep(4)

for name, logfile in [("datafeed", f"{LOG}/datafeed.log"),
                       ("adapter",  f"{LOG}/adapter.log"),
                       ("engine",   f"{LOG}/engine.log"),
                       ("executor", f"{LOG}/executor.log")]:
    print(f"\n--- {name}.log ---")
    r = subprocess.run(f"tail -6 {logfile}", shell=True, capture_output=True, text=True)
    print(r.stdout or "(empty)")

print("\nDone. Frontend (npm run dev) is NOT restarted - it should still be running.")
