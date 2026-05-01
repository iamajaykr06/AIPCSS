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


class Batch(db.Model):
    __tablename__ = "batches"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)  # e.g., "Batch 2023-26"
    code = db.Column(db.String(50), nullable=False, unique=True)  # e.g., "B23"
    academic_year = db.Column(db.String(20), nullable=False)  # e.g., "2023-2024"
    program_id = db.Column(db.Integer, db.ForeignKey("programs.id"), nullable=False)
    current_semester = db.Column(db.Integer, nullable=False, default=1)  # 1-8

    sections = db.relationship("Section", backref="batch", lazy=True)

    def __repr__(self):
        return f"<Batch {self.name}>"
