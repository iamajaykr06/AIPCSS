
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const cwd = process.cwd();

function perfectFix(fileName, headerMap = {}, addNameFrom = null) {
    const filePath = path.join(cwd, fileName);
    if (!fs.existsSync(filePath)) return;

    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet);

    const transformedData = data.map(row => {
        const newRow = {};
        // Use all lowercase for finding keys to be case-insensitive
        const lowerRow = {};
        Object.keys(row).forEach(k => lowerRow[k.toLowerCase().trim()] = row[k]);

        // Map predicted headers
        Object.keys(headerMap).forEach(target => {
            const source = headerMap[target].toLowerCase().trim();
            newRow[target] = lowerRow[source];
        });

        // Specific case: Name derived from another col
        if (addNameFrom && !newRow['Name']) {
            newRow['Name'] = lowerRow[addNameFrom.toLowerCase().trim()];
        }

        // Preserve and trim specific columns if not in map
        ['DeptCode', 'ProgramCode', 'BatchCode', 'Program', 'Code', 'code'].forEach(col => {
            if (newRow[col] && typeof newRow[col] === 'string') {
                newRow[col] = newRow[col].trim();
            }
        });

        return newRow;
    });

    const newSheet = XLSX.utils.json_to_sheet(transformedData);
    workbook.Sheets[workbook.SheetNames[0]] = newSheet;
    XLSX.writeFile(workbook, filePath);
    console.log(`✔ Exact match applied to ${fileName}`);
}

console.log("Applying final perfect header match...");

// Department: Name, Code
perfectFix('departments.xlsx', { 'Name': 'name', 'Code': 'code' });

// Program: Name, Code, DeptCode
perfectFix('programs.xlsx', { 'Name': 'name', 'Code': 'code', 'DeptCode': 'deptcode' });

// Batch: Name, Code, Year, ProgramCode
perfectFix('batches.xlsx', { 
    'Code': 'batch_id', 
    'Year': 'batch_year', 
    'ProgramCode': 'program_code' 
}, 'batch_id'); // Use batch_id as Name too

// Section: Name, Count, BatchCode
perfectFix('sections.xlsx', { 
    'Name': 'section', 
    'Count': 'strength', 
    'BatchCode': 'batch_id' 
});

// Faculty: name, email, phone, department_codes, course_codes
perfectFix('faculty.xlsx', { 
    'name': 'name', 
    'email': 'email', 
    'phone': 'phone', 
    'department_codes': 'department_codes', 
    'course_codes': 'course_codes' 
});

// Course: Name, code, Semester, Type, Program, DeptCode
perfectFix('courses.xlsx', { 
    'Name': 'name', 
    'code': 'code', 
    'Semester': 'semester', 
    'Type': 'type', 
    'Program': 'program', 
    'DeptCode': 'deptcode' 
});

// Room: Name, Capacity, Type
perfectFix('room.xlsx', { 
    'Name': 'name', 
    'Capacity': 'capacity', 
    'Type': 'type' 
});

console.log("Ready for commit.");
