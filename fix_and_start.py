"""
MedCare - Fix Script
Run this to apply missing migrations and restart the server.
"""
import os
import sys
import subprocess

os.chdir(os.path.dirname(os.path.abspath(__file__)))
PY = sys.executable

def run(args):
    try:
        result = subprocess.run([PY] + args)
        return result.returncode
    except Exception as e:
        print(f"  Warning: {e}")
        return -1

print()
print("╔══════════════════════════════════════════════╗")
print("║   MedCare - Applying Migrations & Fix        ║")
print("╠══════════════════════════════════════════════╣")
print("║  Running makemigrations (pharmacy, depts)... ║")

run(["manage.py", "makemigrations", "pharmacy", "--no-input"])
run(["manage.py", "makemigrations", "departments", "--no-input"])
run(["manage.py", "makemigrations", "doctors", "--no-input"])
run(["manage.py", "makemigrations", "--no-input"])

print("║  Applying migrate...                          ║")
run(["manage.py", "migrate", "--no-input"])

print("║  Seeding sample data...                       ║")
run(["manage.py", "seed_data"])

print("╠══════════════════════════════════════════════╣")
print("║                                              ║")
print("║  ✅ Migrations done! Starting server...       ║")
print("║  🌐 http://127.0.0.1:8000                    ║")
print("║                                              ║")
print("║  Admin:   admin    / admin123                ║")
print("║  Doctor:  dr_sarah / doctor123               ║")
print("║  Patient: john_doe / patient123              ║")
print("║                                              ║")
print("║  Press CTRL+C to stop the server             ║")
print("╚══════════════════════════════════════════════╝")
print()

os.execv(PY, [PY, "manage.py", "runserver", "127.0.0.1:8000"])
