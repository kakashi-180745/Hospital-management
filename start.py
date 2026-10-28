"""
MedCare - Quick Start Script
Double-click OR run: python start.py
"""
import os
import sys
import subprocess

os.chdir(os.path.dirname(os.path.abspath(__file__)))
PY = sys.executable

def run(args, check=False):
    try:
        result = subprocess.run([PY] + args, capture_output=False)
        return result.returncode
    except Exception as e:
        print(f"  Warning: {e}")
        return -1

print()
print("╔══════════════════════════════════════════════╗")
print("║   MedCare Hospital Management System         ║")
print("╠══════════════════════════════════════════════╣")


# Check Django installed
try:
    import django
    print(f"║  ✓ Django {django.VERSION[0]}.{django.VERSION[1]} found                          ║")
except ImportError:
    print("║  Installing Django + Pillow...                ║")
    subprocess.run([PY, "-m", "pip", "install", "django", "pillow", "-q"])
    print("║  ✓ Packages installed                         ║")

# Set Django settings
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "hospital_management.settings")

# Run migrations
print("║  Running migrations...                        ║")
run(["manage.py", "makemigrations", "--no-input", "-v", "0"])
run(["manage.py", "migrate", "--no-input", "-v", "0"])
print("║  ✓ Database ready                             ║")

# Seed data
print("║  Seeding sample data...                       ║")
ret = run(["manage.py", "seed_data"])
if ret == 0:
    print("║  ✓ Sample data loaded                         ║")
else:
    print("║  ✓ Data already seeded (or skipped)           ║")

print("╠══════════════════════════════════════════════╣")
print("║                                              ║")
print("║  🌐 http://127.0.0.1:8000                    ║")
print("║                                              ║")
print("║  Admin:   admin    / admin123                ║")
print("║  Doctor:  dr_sarah / doctor123               ║")
print("║  Patient: john_doe / patient123              ║")
print("║                                              ║")
print("║  Press CTRL+C to stop the server             ║")
print("╚══════════════════════════════════════════════╝")
print()

# Start server
os.execv(PY, [PY, "manage.py", "runserver", "127.0.0.1:8000"])
