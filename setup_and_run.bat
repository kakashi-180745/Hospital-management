@echo off
echo ============================================
echo   MedCare Hospital Management System Setup
echo ============================================

cd /d "c:\Users\ompra\OneDrive\Documents\srija"

echo.
echo [1/5] Creating virtual environment...
C:\Users\ompra\AppData\Local\Programs\Python\Python310\python.exe -m venv venv

echo.
echo [2/5] Activating virtual environment and installing packages...
call venv\Scripts\activate.bat
pip install django pillow

echo.
echo [3/5] Running database migrations...
python manage.py makemigrations
python manage.py migrate

echo.
echo [4/5] Seeding initial hospital data (departments, doctors, patients)...
python manage.py seed_data

echo.
echo [5/5] Starting development server...
echo.
echo ============================================
echo  ACCESS THE SYSTEM AT: http://127.0.0.1:8000
echo.
echo  Admin Login:   admin / admin123
echo  Doctor Login:  dr_sarah / doctor123
echo  Patient Login: john_doe / patient123
echo ============================================
echo.
python manage.py runserver
