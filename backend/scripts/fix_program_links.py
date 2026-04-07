import sys
import os
from flask import Flask
from sqlalchemy import text, inspect
import logging

# Ensure we're in the right directory to import app
sys.path.append(os.getcwd())

from app import create_app, db
from app.models.course import Course
from app.models.program import Program
from app.scheduler_new.data_loader import DataLoader

app = create_app('development')

with app.app_context():
    print("--- 1. Database Schema Update ---")
    
    # Check if program_id column exists
    inspector = inspect(db.engine)
    columns = [c['name'] for c in inspector.get_columns('course')]
    
    if 'program_id' not in columns:
        print("Column 'program_id' missing from 'course' table. Adding it now...")
        try:
            # For SQLite, ALTER TABLE is simple
            db.session.execute(text('ALTER TABLE course ADD COLUMN program_id INTEGER REFERENCES programs(id)'))
            db.session.commit()
            print("Successfully added 'program_id' column.")
        except Exception as e:
            print(f"Error adding column: {e}")
            db.session.rollback()
    else:
        print("Column 'program_id' already exists.")

    print("\n--- 2. Data Linking (Course -> Program) ---")
    
    programs = Program.query.all()
    courses = Course.query.all()
    
    link_count = 0
    fail_count = 0
    
    for course in courses:
        if not course.program_code:
            continue
            
        # Try to find the best matching program
        best_match = None
        best_score = -1.0
        
        for p in programs:
            # Exact match first
            if course.program_code.strip().upper() == p.code.strip().upper():
                best_match = p
                best_score = 100.0
                break
                
            # Fuzzy match
            score = DataLoader._calculate_program_similarity(course.program_code, p.code)
            if score > best_score and score >= 0.3:
                best_score = score
                best_match = p
        
        if best_match:
            course.program_id = best_match.id
            link_count += 1
            if best_score < 100.0:
                 print(f"  [LINK] Linked '{course.code}' to Program '{best_match.code}' (Fuzzy score: {best_score:.2f})")
        else:
            fail_count += 1
            print(f"  [FAIL] No match for Course '{course.code}' (Label: '{course.program_code}')")

    db.session.commit()
    print(f"\n--- Results ---")
    print(f"Total courses linked  : {link_count}")
    print(f"Total courses orphaned: {fail_count}")
    print(f"Finished! Your scheduler will now use these direct links.")
