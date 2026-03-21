#!/usr/bin/env python3
"""
Simple script to add department_id column to rooms table for SQLite
"""

import sqlite3
import sys
import os

def add_department_column():
    """Add department_id column to rooms table"""
    db_path = r"C:\Users\Ajay Kumar\OneDrive\Desktop\AIPSCSS\backend\instance\development.db"
    print(f"Database path: {db_path}")
    
    conn = None
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check what tables exist
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [row[0] for row in cursor.fetchall()]
        print(f"Existing tables: {tables}")
        
        if 'room' not in tables:
            print("Room table doesn't exist yet. Please run 'flask db upgrade' first.")
            return
        
        # Check if column already exists
        cursor.execute("PRAGMA table_info(room)")
        columns = [column[1] for column in cursor.fetchall()]
        print(f"Existing columns in room: {columns}")
        
        if 'department_id' in columns:
            print("Column 'department_id' already exists in room table")
            return
        
        # Add the column
        cursor.execute("ALTER TABLE room ADD COLUMN department_id INTEGER")
        
        # Create index for better performance
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_room_department_id ON room(department_id)")
        
        conn.commit()
        print("Successfully added department_id column to rooms table")
        
    except sqlite3.Error as e:
        print(f"Database error: {e}")
        sys.exit(1)
    finally:
        if conn:
            conn.close()

if __name__ == '__main__':
    add_department_column()
