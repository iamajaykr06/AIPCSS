import os
import pandas as pd

def check_data():
    base_dir = r"c:\Users\Ajay Kumar\AIPCSS"
    
    sections_path = os.path.join(base_dir, "sections.xlsx")
    rooms_path = os.path.join(base_dir, "room.xlsx")
    
    print("=== DATASET SANITY CHECKER ===")
    
    if not os.path.exists(sections_path) or not os.path.exists(rooms_path):
        print("Could not find sections.xlsx or room.xlsx in the base directory.")
        return
        
    try:
        sections_df = pd.read_excel(sections_path)
        rooms_df = pd.read_excel(rooms_path)
        
        # Hunt for capacity and student count columns regardless of exact naming
        cap_col = next((c for c in rooms_df.columns if 'cap' in str(c).lower()), None)
        stu_col = next((c for c in sections_df.columns if 'count' in str(c).lower() or 'stud' in str(c).lower() or 'size' in str(c).lower()), None)
        
        if cap_col and stu_col:
            max_room_cap = int(rooms_df[cap_col].max())
            max_section_size = int(sections_df[stu_col].max())
            
            print(f"✅ Max Room Capacity available: {max_room_cap}")
            print(f"📊 Largest Section Size needed: {max_section_size}")
            
            if max_section_size > max_room_cap:
                print("\n🚨 CRITICAL IMPOSSIBILITY DETECTED! 🚨")
                print(f"You have sections spanning up to {max_section_size} students, but your LARGEST room only holds {max_room_cap}!")
                print("The engine is fiercely defending physics: it refuses to assign 100 students into a 60-seat room, meaning domains collapse to zero.")
                
                # List offending sections
                oversized = sections_df[sections_df[stu_col] > max_room_cap]
                print(f"\nFound {len(oversized)} offending sections that CANNOT fit locally:")
                print(oversized[[c for c in sections_df.columns if c in [stu_col, 'Name', 'Program Code', 'Batch Code']]].head(10))
            else:
                print("\n✅ Base capacities look logically possible.")
                
            # Check for Labs
            type_col = next((c for c in rooms_df.columns if 'type' in str(c).lower()), None)
            if type_col:
                lab_rooms = rooms_df[rooms_df[type_col].astype(str).str.contains('lab', case=False, na=False)]
                print(f"\n🧪 Found {len(lab_rooms)} Lab Rooms available for assignment.")
                if len(lab_rooms) == 0:
                    print("⚠️ WARNING: No explicit Lab rooms found. Lab courses will rely purely on normal rooms via fallback.")

        else:
            print("Could not automatically locate the Capacity or Student Count columns.")
            
    except Exception as e:
        print(f"Error reading datasets: {e}")

if __name__ == "__main__":
    check_data()
