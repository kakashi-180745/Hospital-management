"""
MedCare Hospital Management System - Auto Setup & Run Script
Run this file directly: python run.py
"""

import os
import sys
import subprocess

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PYTHON = sys.executable

def run(cmd, cwd=BASE_DIR):
    print(f"\n>>> {cmd}")
    result = subprocess.run(cmd, shell=True, cwd=cwd, executable=None)
    return result.returncode

print("=" * 55)
print("  MedCare Hospital Management System - Auto Setup")
print("=" * 55)

# Step 1: Install packages
print("\n[1/4] Installing required packages...")
run(f'"{PYTHON}" -m pip install django pillow')

# Step 2: Migrations
print("\n[2/4] Creating database migrations...")
run(f'"{PYTHON}" manage.py makemigrations')
run(f'"{PYTHON}" manage.py migrate')

# Step 3: Seed data
print("\n[3/4] Seeding initial data (departments, doctors, patients)...")
run(f'"{PYTHON}" manage.py seed_data')

# Step 4: Run server
print("\n[4/4] Starting Django development server...")
print()
print("=" * 55)
print("  SYSTEM READY! Open your browser at:")
print("  http://127.0.0.1:8000")
print()
print("  Admin Login:    http://127.0.0.1:8000/admin-login/")
print("  Doctor Login:   http://127.0.0.1:8000/doctor/login/")
print("  Patient Portal: http://127.0.0.1:8000/login/")
print()
print("  Credentials:")
print("  admin   / admin123    (Full Admin Access)")
print("  dr_sarah / doctor123   (Doctor Portal)")
print("  john_doe / patient123  (Patient Portal)")
print("=" * 55)
print()
os.execv(sys.executable, [sys.executable, 'manage.py', 'runserver'])
