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

class WorkloadAllocation(db.Model):
    """
    Explicit mapping of which teacher teaches which course for which section.
    This replaces fuzzy matching and qualification-based guessing.
    """
    __tablename__ = 'workload_allocations'
    __table_args__ = (
        db.UniqueConstraint('section_id', 'course_id', name='_section_course_uc'),
    )
    
    id = db.Column(db.Integer, primary_key=True)
    
    # 1. Scope (Where is this being taught?)
    section_id = db.Column(db.Integer, db.ForeignKey('sections.id'), nullable=False)
    
    # 2. Content (What is being taught?)
    course_id = db.Column(db.Integer, db.ForeignKey('course.id'), nullable=False)
    
    # 3. Resource (Who is teaching it?)
    teacher_id = db.Column(db.Integer, db.ForeignKey('teacher.id'), nullable=False)
    
    # Relationships for easy access
    section = db.relationship('Section', backref=db.backref('workloads', cascade='all, delete-orphan'))
    course = db.relationship('Course', backref='workloads')
    teacher = db.relationship('Teacher', backref='workloads')

    def __repr__(self):
        return f'<Workload {self.section_id}:{self.course_id}->{self.teacher_id}>'
