"""
Copyright 2026 Zaid Alam, Ajay Kumar, Aboni Mohan Sahu, Rohit Kumar Yadav

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
"""

from .. import db

# Association table for Many-to-Many relationship between Teacher and Department
teacher_departments = db.Table('teacher_departments',
    db.Column('teacher_id', db.Integer, db.ForeignKey('teacher.id'), primary_key=True),
    db.Column('department_id', db.Integer, db.ForeignKey('department.id'), primary_key=True)
)

# Association table for Courses a teacher is qualified to teach
teacher_qualifications = db.Table('teacher_qualifications',
    db.Column('teacher_id', db.Integer, db.ForeignKey('teacher.id'), primary_key=True),
    db.Column('course_id', db.Integer, db.ForeignKey('course.id'), primary_key=True)
)

class Teacher(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    phone = db.Column(db.String(20), nullable=True)
    abbreviation = db.Column(db.String(10), nullable=True)
    availability = db.Column(db.JSON, nullable=True)
    max_hours_per_day = db.Column(db.Integer, nullable=True, default=6)
    max_hours_per_week = db.Column(db.Integer, nullable=True, default=30)
    
    # Many-to-Many relationship with Department (Administrative)
    departments = db.relationship('Department', secondary=teacher_departments, 
                                  backref=db.backref('teachers', lazy='dynamic'))
    
    # Many-to-Many relationship with Course (Domain Expertise)
    qualified_courses = db.relationship('Course', secondary=teacher_qualifications,
                                       backref=db.backref('qualified_teachers', lazy='dynamic'))

    def __repr__(self):
        return f'<Teacher {self.name}>'
