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

# Association table for Mega-Lectures (Multiple sections in one entry)
entry_sections = db.Table(
    "entry_sections",
    db.Column("entry_id", db.Integer, db.ForeignKey("timetable_entries.id"), primary_key=True),
    db.Column("section_id", db.Integer, db.ForeignKey("sections.id"), primary_key=True),
)


class TimetableEntry(db.Model):
    __tablename__ = "timetable_entries"

    id = db.Column(db.Integer, primary_key=True)
    day = db.Column(db.String(10), nullable=False)
    timeslot = db.Column(db.String(20), nullable=False)

    # RELATIONS
    course_id = db.Column(db.Integer, db.ForeignKey("course.id"), nullable=False)
    teacher_id = db.Column(db.Integer, db.ForeignKey("teacher.id"), nullable=False)
    room_id = db.Column(db.Integer, db.ForeignKey("room.id"), nullable=False)
    department_id = db.Column(db.Integer, db.ForeignKey("department.id"), nullable=False)

    # Many-to-Many with Section
    sections = db.relationship(
        "Section", secondary=entry_sections, backref=db.backref("timetable_entries", lazy="dynamic")
    )

    def __repr__(self):
        return f"<TimetableEntry {self.day} {self.timeslot}>"
