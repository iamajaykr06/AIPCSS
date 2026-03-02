import pandas as pd

# Create sample curriculum data
data = [
    # BCA Courses
    {'code': 'BCA-101', 'Name': 'Programming Fundamentals', 'Type': 'Theory', 'Semester': 'I', 'Program': 'CS-PROG', 'Department': 'Department of Computer Science and Information Technology'},
    {'code': 'BCA-102', 'Name': 'Mathematics I', 'Type': 'Theory', 'Semester': 'I', 'Program': 'CS-PROG', 'Department': 'Department of Computer Science and Information Technology'},
    {'code': 'BCA-103', 'Name': 'Digital Logic', 'Type': 'Lab', 'Semester': 'I', 'Program': 'CS-PROG', 'Department': 'Department of Computer Science and Information Technology'},
    
    {'code': 'BCA-201', 'Name': 'Data Structures', 'Type': 'Theory', 'Semester': 'II', 'Program': 'CS-PROG', 'Department': 'Department of Computer Science and Information Technology'},
    {'code': 'BCA-202', 'Name': 'Mathematics II', 'Type': 'Theory', 'Semester': 'II', 'Program': 'CS-PROG', 'Department': 'Department of Computer Science and Information Technology'},
    {'code': 'BCA-203', 'Name': 'Web Development', 'Type': 'Lab', 'Semester': 'II', 'Program': 'CS-PROG', 'Department': 'Department of Computer Science and Information Technology'},
    
    {'code': 'BCA-301', 'Name': 'Database Management', 'Type': 'Theory', 'Semester': 'III', 'Program': 'CS-PROG', 'Department': 'Department of Computer Science and Information Technology'},
    {'code': 'BCA-302', 'Name': 'Operating Systems', 'Type': 'Theory', 'Semester': 'III', 'Program': 'CS-PROG', 'Department': 'Department of Computer Science and Information Technology'},
    {'code': 'BCA-303', 'Name': 'Advanced Programming', 'Type': 'Lab', 'Semester': 'III', 'Program': 'CS-PROG', 'Department': 'Department of Computer Science and Information Technology'},
    
    {'code': 'BCA-401', 'Name': 'Software Engineering', 'Type': 'Theory', 'Semester': 'IV', 'Program': 'CS-PROG', 'Department': 'Department of Computer Science and Information Technology'},
    {'code': 'BCA-402', 'Name': 'Computer Networks', 'Type': 'Theory', 'Semester': 'IV', 'Program': 'CS-PROG', 'Department': 'Department of Computer Science and Information Technology'},
    {'code': 'BCA-403', 'Name': 'Artificial Intelligence', 'Type': 'Lab', 'Semester': 'IV', 'Program': 'CS-PROG', 'Department': 'Department of Computer Science and Information Technology'},
    
    {'code': 'BCA-501', 'Name': 'Machine Learning', 'Type': 'Theory', 'Semester': 'V', 'Program': 'CS-PROG', 'Department': 'Department of Computer Science and Information Technology'},
    {'code': 'BCA-502', 'Name': 'Cloud Computing', 'Type': 'Theory', 'Semester': 'V', 'Program': 'CS-PROG', 'Department': 'Department of Computer Science and Information Technology'},
    {'code': 'BCA-503', 'Name': 'Mobile Development', 'Type': 'Lab', 'Semester': 'V', 'Program': 'CS-PROG', 'Department': 'Department of Computer Science and Information Technology'},
    
    {'code': 'BCA-601', 'Name': 'Project Work', 'Type': 'Lab', 'Semester': 'VI', 'Program': 'CS-PROG', 'Department': 'Department of Computer Science and Information Technology'},
    {'code': 'BCA-602', 'Name': 'Internship', 'Type': 'Lab', 'Semester': 'VI', 'Program': 'CS-PROG', 'Department': 'Department of Computer Science and Information Technology'},
    {'code': 'BCA-603', 'Name': 'Research Methodology', 'Type': 'Theory', 'Semester': 'VI', 'Program': 'CS-PROG', 'Department': 'Department of Computer Science and Information Technology'},
]

# Create DataFrame and save to Excel
df = pd.DataFrame(data)
df.to_excel('courses.xlsx', index=False)

print("✅ Sample courses.xlsx file created successfully!")
print(f"📊 Created {len(data)} sample courses for BCA program")
print("\n📋 File contents:")
print(df.head())
