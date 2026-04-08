import pandas as pd
import os

def fix_courses():
    print("Fixing courses.xlsx...")
    file_path = 'courses.xlsx'
    if not os.path.exists(file_path):
        print(f"File {file_path} not found. Skipping.")
        return

    df = pd.read_excel(file_path)
    
    # D1: Program Name Mismatches
    mismatches = {
        'B. Com': 'B.Com',
        'B.Pharm': 'B.Pharma',
        'B.SC. AGRI': 'B.Sc Agriculture',
        'B.Tech MIE': 'B.Tech Mining',
        'BA LL B': 'BA LLB',
        'D. Pharm': 'D.Pharma',
        'Diploma MIE': 'Diploma Mining',
        'M.Sc. AGRI': 'M.Sc Agriculture'
    }
    if 'Program' in df.columns:
        df['Program'] = df['Program'].replace(mismatches)
        print(f"  - Fixed program name mismatches in 'Program' column.")

    # D2: Duplicate Course Codes
    # Find duplicates and append semester
    if 'code' in df.columns and 'Semester' in df.columns:
        duplicates = df[df.duplicated(subset=['code'], keep=False)]
        if not duplicates.empty:
            def make_unique(row):
                return f"{row['code']}-{str(row['Semester']).strip()}"
            mask = df.duplicated(subset=['code'], keep=False)
            df.loc[mask, 'code'] = df[mask].apply(make_unique, axis=1)
            print(f"  - Made {len(duplicates)} duplicate course codes unique (appended semester).")

    df.to_excel(file_path, index=False)
    print("Done.")

def fix_rooms():
    print("Fixing room.xlsx...")
    file_path = 'room.xlsx'
    if not os.path.exists(file_path):
        print(f"File {file_path} not found. Skipping.")
        return

    df = pd.read_excel(file_path)
    
    # D5: DeptCode MIN -> MINE
    if 'DeptCode' in df.columns:
        df['DeptCode'] = df['DeptCode'].replace({'MIN': 'MINE'})
        print(f"  - Fixed DeptCode MIN -> MINE.")

    # D6: ProgramCode mapping
    program_map = {
        'BPHARM': 'B.Pharma',
        'BSCAGRI': 'B.Sc Agriculture',
        'BTCMIE': 'B.Tech Mining',
        'DIPMIE': 'Diploma Mining'
    }
    if 'ProgramCode' in df.columns:
        df['ProgramCode'] = df['ProgramCode'].replace(program_map)
        print(f"  - Fixed ProgramCode abbreviations.")

    df.to_excel(file_path, index=False)
    print("Done.")

def fix_faculty():
    print("Fixing faculty.xlsx...")
    file_path = 'faculty.xlsx'
    if not os.path.exists(file_path):
        print(f"File {file_path} not found. Skipping.")
        return

    df = pd.read_excel(file_path)
    
    # D3: Deduplicate by email
    if 'email' in df.columns:
        count_before = len(df)
        df = df.drop_duplicates(subset=['email'], keep='first')
        print(f"  - Removed {count_before - len(df)} duplicate faculty entries by email.")

    df.to_excel(file_path, index=False)
    print("Done.")

if __name__ == "__main__":
    try:
        fix_courses()
        fix_rooms()
        fix_faculty()
        print("\nAll data fixes applied to Excel files successfully.")
        print("Now you can re-import the files into the application.")
    except Exception as e:
        print(f"Error during remediation: {e}")
