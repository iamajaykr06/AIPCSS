import pandas as pd
import os
import re

def fix_remaining():
    print("Fixing courses.xlsx (D9)...")
    courses_path = 'courses.xlsx'
    if os.path.exists(courses_path):
        df_courses = pd.read_excel(courses_path)
        
        # D9: Standardize Semester Values
        if 'Semester' in df_courses.columns:
            def clean_semester(val):
                if pd.isna(val): return val
                if isinstance(val, (int, float)): return int(val)
                # Roman numerals
                roman = {'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 'VII': 7, 'VIII': 8}
                match = re.search(r'(VIII|VII|VI|V|IV|III|II|I)', str(val).upper())
                if match:
                    return roman.get(match.group(0))
                # Digits
                digits = re.findall(r'\d+', str(val))
                if digits:
                    return int(digits[0])
                return val
            
            df_courses['Semester'] = df_courses['Semester'].apply(clean_semester)
            print("  - Standardized semester values.")
            df_courses.to_excel(courses_path, index=False)
        else:
            print("  - 'Semester' column not found in courses.xlsx")
    else:
        print(f"  - {courses_path} not found.")

    print("\nFixing faculty.xlsx (D4)...")
    faculty_path = 'faculty.xlsx'
    if os.path.exists(faculty_path) and os.path.exists(courses_path):
        df_faculty = pd.read_excel(faculty_path)
        df_courses = pd.read_excel(courses_path)
        
        # Create a mapping from base code to new unique codes (from D2 fix)
        # In D2, we appended -S{Semester} to duplicate codes.
        # But wait, if multiple semesters use the same code, which one should we map to for a teacher?
        # Usually, a teacher is qualified for the "course" regardless of semester.
        # However, the system now treats them as unique codes.
        
        # Let's find all codes in courses.xlsx
        all_new_codes = set(df_courses['code'].dropna().unique())
        
        def update_course_codes(val):
            if pd.isna(val): return val
            codes = [c.strip() for c in str(val).replace(';', ',').split(',') if c.strip()]
            new_codes = []
            for c in codes:
                if c in all_new_codes:
                    new_codes.append(c)
                else:
                    # Try to find if it corresponds to multiple new codes
                    matches = [nc for nc in all_new_codes if nc.startswith(c + "-")]
                    if matches:
                        new_codes.extend(matches)
                    else:
                        new_codes.append(c) # Orphan, but keep it
            return ",".join(new_codes)

        if 'course_codes' in df_faculty.columns:
            df_faculty['course_codes'] = df_faculty['course_codes'].apply(update_course_codes)
            print("  - Updated course codes in faculty.xlsx to match new unique codes.")
            df_faculty.to_excel(faculty_path, index=False)
        else:
            # Try lowercase
            df_faculty.columns = [c.lower() for c in df_faculty.columns]
            if 'course_codes' in df_faculty.columns:
                df_faculty['course_codes'] = df_faculty['course_codes'].apply(update_course_codes)
                print("  - Updated course codes (lowercase col) in faculty.xlsx.")
                df_faculty.to_excel(faculty_path, index=False)
    else:
        print("  - Files missing for D4 fix.")

if __name__ == "__main__":
    fix_remaining()
