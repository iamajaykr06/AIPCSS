
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const files = [
    'departments.xlsx',
    'programs.xlsx',
    'batches.xlsx',
    'sections.xlsx',
    'faculty.xlsx',
    'courses.xlsx',
    'room.xlsx'
];

const results = {};

files.forEach(file => {
    const filePath = path.join(process.cwd(), file);
    if (!fs.existsSync(filePath)) {
        results[file] = "NOT_FOUND";
        return;
    }
    const workbook = XLSX.readFile(filePath);
    const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
    results[file] = {
        headers: data.length > 0 ? Object.keys(data[0]) : [],
        sample: data[0] || {}
    };
});

console.log(JSON.stringify(results, null, 2));
