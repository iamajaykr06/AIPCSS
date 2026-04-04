from .. import db


class ScheduleSettings(db.Model):
    """Global scheduling configuration settings."""
    __tablename__ = 'schedule_settings'

    id = db.Column(db.Integer, primary_key=True)

    # Working days configuration
    working_days = db.Column(db.JSON, default=list, nullable=False)

    # Time slots configuration
    time_slots = db.Column(db.JSON, default=list, nullable=False)

    # Breaks configuration
    breaks = db.Column(db.JSON, default=list, nullable=False)

    # General settings
    slot_duration_minutes = db.Column(db.Integer, default=60, nullable=False)
    start_time = db.Column(db.String(5), default='09:00', nullable=False)
    end_time = db.Column(db.String(5), default='17:00', nullable=False)

    # Constraints
    max_consecutive_slots = db.Column(db.Integer, default=3, nullable=False)
    min_break_between_classes = db.Column(db.Integer, default=0, nullable=False)

    created_at = db.Column(db.DateTime, server_default=db.func.now())
    updated_at = db.Column(db.DateTime, server_default=db.func.now(), onupdate=db.func.now())

    def to_dict(self):
        return {
            'id': self.id,
            'working_days': self.working_days or [],
            'time_slots': self.time_slots or [],
            'breaks': self.breaks or [],
            'slot_duration_minutes': self.slot_duration_minutes,
            'start_time': self.start_time,
            'end_time': self.end_time,
            'max_consecutive_slots': self.max_consecutive_slots,
            'min_break_between_classes': self.min_break_between_classes,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

    @classmethod
    def get_or_create_default(cls):
        """Get existing settings or create default ones."""
        settings = cls.query.first()
        if not settings:
            settings = cls(
                working_days=['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
                time_slots=[
                    {'start': '09:00', 'end': '10:00', 'label': 'Period 1'},
                    {'start': '10:00', 'end': '11:00', 'label': 'Period 2'},
                    {'start': '11:00', 'end': '12:00', 'label': 'Period 3'},
                    {'start': '13:00', 'end': '14:00', 'label': 'Period 4'},
                    {'start': '14:00', 'end': '15:00', 'label': 'Period 5'},
                    {'start': '15:00', 'end': '16:00', 'label': 'Period 6'},
                ],
                breaks=[
                    {'start': '12:00', 'end': '13:00', 'label': 'Lunch Break', 'type': 'lunch'},
                ],
                slot_duration_minutes=60,
                start_time='09:00',
                end_time='16:00',
                max_consecutive_slots=3,
                min_break_between_classes=0,
            )
            db.session.add(settings)
            db.session.commit()
        return settings
