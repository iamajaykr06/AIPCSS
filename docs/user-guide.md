# User Guide

This guide explains how to use AIPCSS to generate and manage class schedules.

## Getting Started

### 1. Registration and Login

1. Navigate to the AIPCSS application URL
2. Click **Register** to create a new account
3. Fill in your username, email, and password
4. Click **Register** to create the account
5. Log in with your credentials

### 2. Dashboard Overview

After logging in, you will see the dashboard which provides:
- **Quick Stats**: Total departments, teachers, rooms, courses, and sections
- **Recent Activity**: Latest schedule generation results
- **Quick Actions**: Shortcuts to common tasks

## Setting Up Your Institution

### Step 1: Add Departments

Navigate to **Departments** → Click **Add Department**
- Enter the department name (e.g., "Computer Science & Engineering")
- Enter a short code (e.g., "CSE")
- Optionally, enter the department head's name

### Step 2: Add Programs

Navigate to **Programs** → Click **Add Program**
- Enter the program name (e.g., "B.Tech in Computer Science")
- Enter the program code (e.g., "BT-CSE")
- Select the parent department
- Set the duration (in years)

### Step 3: Add Batches and Sections

Navigate to **Batches** → Click **Add Batch**
- Enter the batch year or name (e.g., "2024")
- Select the parent program

Navigate to **Sections** → Click **Add Section**
- Enter the section name (e.g., "A", "B", "C")
- Enter the number of students
- Select the parent batch

### Step 4: Add Courses

Navigate to **Courses** → Click **Add Course**
- Enter the course code (e.g., "CS201")
- Enter the course name (e.g., "Data Structures & Algorithms")
- Set the credit hours
- Select course type (Theory / Lab / Tutorial)
- Select the offering department

### Step 5: Add Teachers

Navigate to **Teachers** → Click **Add Teacher**
- Enter the teacher's full name
- Enter the employee ID
- Select the department
- Set the maximum teaching hours per week
- Configure available days and time slots

### Step 6: Add Rooms

Navigate to **Rooms** → Click **Add Room**
- Enter the room name/number (e.g., "Room 301")
- Enter the building name
- Set the seating capacity
- Select the room type (Classroom / Lab / Seminar Hall)
- Add available facilities (Projector, AC, Whiteboard, etc.)

### Step 7: Assign Courses to Sections (Curriculum)

Navigate to the appropriate section or use the curriculum management feature to assign:
- Which courses are taught in which sections
- Which teacher handles each course
- The number of weekly lectures per course

## Generating Timetables

### 1. Navigate to Scheduling

Go to **Timetable** → **Generate Schedule**

### 2. Configure Generation Settings

- **Select Algorithm**: Choose from OR-Tools, Genetic, Greedy, or Hybrid
- **Select Batches**: Choose which batches to include
- **Semester**: Enter the semester identifier
- **Working Days**: Select which days are working days
- **Periods Per Day**: Set the number of teaching periods
- **Time Range**: Set the start and end time

### 3. Generate

Click **Generate Timetable** and wait for the algorithm to process. The time required depends on:
- Number of courses and sections
- Algorithm selected (OR-Tools may take longer for large inputs)
- Server resources

### 4. View Results

After generation, the timetable will be displayed in a grid view showing:
- Days as columns and periods as rows
- Course code, teacher name, and room for each slot
- Color coding for different departments or sections

## Viewing Timetables

You can filter the timetable view by:
- **Batch**: Show schedule for a specific batch
- **Section**: Show schedule for a specific section
- **Teacher**: Show a teacher's weekly schedule
- **Room**: Show room occupancy throughout the week

## Exporting Timetables

### PDF Export

1. Navigate to the timetable view
2. Apply desired filters
3. Click **Export PDF**
4. Select format (A4 / Letter)
5. The PDF will be downloaded automatically

## Workload Analysis

Navigate to **Workload** to view:
- **Teacher Utilization**: Percentage of teaching hours used vs. maximum allowed
- **Overloaded Teachers**: Teachers exceeding their maximum hours
- **Underloaded Teachers**: Teachers with available capacity
- **Department Summary**: Workload distribution across departments

## Settings

Navigate to **Settings** to configure:
- Institution name
- Working days
- Periods per day
- Period duration (minutes)
- Break configuration
- Default algorithm preference

## Tips for Best Results

1. **Data Quality**: Ensure all data is accurate and complete before generating timetables
2. **Room Capacity**: Assign rooms with slightly more capacity than section strength
3. **Teacher Availability**: Keep teacher availability updated for accurate scheduling
4. **Start Simple**: Begin with the greedy algorithm for a quick draft, then use OR-Tools for optimization
5. **Incremental Approach**: Schedule smaller batches first, then add more batches incrementally
