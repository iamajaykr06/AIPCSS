#!/usr/bin/env python3
"""Add max_hours columns to teacher table"""
import sqlite3
import os

# Find the database file
base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
db_path = os.path.join(base_dir, 'backend', 'instance', 'development.db')

if not os.path.exists(db_path):
    print(f"Database not found at {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Check if columns already exist
cursor.execute("PRAGMA table_info(teacher)")
columns = [col[1] for col in cursor.fetchall()]

if 'max_hours_per_day' not in columns:
    cursor.execute("ALTER TABLE teacher ADD COLUMN max_hours_per_day INTEGER DEFAULT 6")
    print("Added max_hours_per_day column")
else:
    print("max_hours_per_day column already exists")

if 'max_hours_per_week' not in columns:
    cursor.execute("ALTER TABLE teacher ADD COLUMN max_hours_per_week INTEGER DEFAULT 30")
    print("Added max_hours_per_week column")
else:
    print("max_hours_per_week column already exists")

conn.commit()
conn.close()
print("Migration complete!")
