import re

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required

from ..models import ScheduleSettings
from .. import db
from .auth import roles_required

settings_bp = Blueprint('settings', __name__)


# ═══════════════════════════════════════════════════════════════════════════════
# SCHEDULE SETTINGS
# ═══════════════════════════════════════════════════════════════════════════════

@settings_bp.route('/schedule', methods=['GET'])
@jwt_required()
def get_schedule_settings():
    """Get the current schedule settings."""
    settings = ScheduleSettings.get_or_create_default()
    return jsonify(settings.to_dict()), 200


@settings_bp.route('/schedule', methods=['PUT'])
@jwt_required()
@roles_required('admin', 'dept_head')
def update_schedule_settings():
    """Update schedule settings."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body must be JSON'}), 400

    settings = ScheduleSettings.get_or_create_default()
    errors = []

    # Validate and update working days
    if 'working_days' in data:
        valid_days = {'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'}
        working_days = data['working_days']
        if not isinstance(working_days, list):
            errors.append("working_days must be a list")
        elif not working_days:
            errors.append("at least one working day is required")
        else:
            invalid_days = set(working_days) - valid_days
            if invalid_days:
                errors.append(f"invalid days: {', '.join(invalid_days)}")
            else:
                settings.working_days = working_days

    # Validate and update time slots
    if 'time_slots' in data:
        time_slots = data['time_slots']
        if not isinstance(time_slots, list):
            errors.append("time_slots must be a list")
        elif not time_slots:
            errors.append("at least one time slot is required")
        else:
            for i, slot in enumerate(time_slots):
                if not isinstance(slot, dict):
                    errors.append(f"time slot {i+1} must be an object")
                    continue
                if 'start' not in slot or 'end' not in slot:
                    errors.append(f"time slot {i+1} must have 'start' and 'end' fields")
                    continue
                # Basic time format validation (HH:MM)
                if not re.match(r'^\d{2}:\d{2}$', str(slot['start'])) or \
                   not re.match(r'^\d{2}:\d{2}$', str(slot['end'])):
                    errors.append(f"time slot {i+1} has invalid time format (use HH:MM)")
            if not errors:
                settings.time_slots = time_slots

    # Validate and update breaks
    if 'breaks' in data:
        breaks = data['breaks']
        if not isinstance(breaks, list):
            errors.append("breaks must be a list")
        else:
            for i, brk in enumerate(breaks):
                if not isinstance(brk, dict):
                    errors.append(f"break {i+1} must be an object")
                    continue
                if 'start' not in brk or 'end' not in brk:
                    errors.append(f"break {i+1} must have 'start' and 'end' fields")
                    continue
                if not re.match(r'^\d{2}:\d{2}$', str(brk['start'])) or \
                   not re.match(r'^\d{2}:\d{2}$', str(brk['end'])):
                    errors.append(f"break {i+1} has invalid time format (use HH:MM)")
            if not errors:
                settings.breaks = breaks

    # Validate and update slot duration
    if 'slot_duration_minutes' in data:
        duration = data['slot_duration_minutes']
        if not isinstance(duration, int) or duration < 15 or duration > 180:
            errors.append("slot_duration_minutes must be between 15 and 180")
        else:
            settings.slot_duration_minutes = duration

    # Validate and update start/end times
    if 'start_time' in data:
        if not re.match(r'^\d{2}:\d{2}$', str(data['start_time'])):
            errors.append("start_time must be in HH:MM format")
        else:
            settings.start_time = data['start_time']

    if 'end_time' in data:
        if not re.match(r'^\d{2}:\d{2}$', str(data['end_time'])):
            errors.append("end_time must be in HH:MM format")
        else:
            settings.end_time = data['end_time']

    # Validate and update constraints
    if 'max_consecutive_slots' in data:
        max_slots = data['max_consecutive_slots']
        if not isinstance(max_slots, int) or max_slots < 1 or max_slots > 10:
            errors.append("max_consecutive_slots must be between 1 and 10")
        else:
            settings.max_consecutive_slots = max_slots

    if 'min_break_between_classes' in data:
        min_break = data['min_break_between_classes']
        if not isinstance(min_break, int) or min_break < 0 or min_break > 60:
            errors.append("min_break_between_classes must be between 0 and 60")
        else:
            settings.min_break_between_classes = min_break

    if errors:
        return jsonify({'error': 'Validation failed', 'details': errors}), 422

    db.session.commit()
    return jsonify({
        'message': 'Schedule settings updated',
        'settings': settings.to_dict()
    }), 200


@settings_bp.route('/schedule/reset', methods=['POST'])
@jwt_required()
@roles_required('admin')
def reset_schedule_settings():
    """Reset schedule settings to defaults."""
    settings = ScheduleSettings.query.first()
    if settings:
        db.session.delete(settings)
        db.session.commit()

    # Create new default settings
    settings = ScheduleSettings.get_or_create_default()
    return jsonify({
        'message': 'Schedule settings reset to defaults',
        'settings': settings.to_dict()
    }), 200


@settings_bp.route('/schedule/preview', methods=['POST'])
@jwt_required()
def preview_schedule():
    """Preview schedule based on settings without saving."""
    data = request.get_json() or {}

    # Use provided settings or get defaults
    if data:
        working_days = data.get('working_days', ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])
        time_slots = data.get('time_slots', [])
        breaks = data.get('breaks', [])
        slot_duration = data.get('slot_duration_minutes', 60)
        start_time = data.get('start_time', '09:00')
        end_time = data.get('end_time', '16:00')
    else:
        settings = ScheduleSettings.get_or_create_default()
        working_days = settings.working_days
        time_slots = settings.time_slots
        breaks = settings.breaks
        slot_duration = settings.slot_duration_minutes
        start_time = settings.start_time
        end_time = settings.end_time

    # Generate preview
    from datetime import datetime, timedelta

    def time_add_minutes(time_str, minutes):
        """Add minutes to a time string."""
        t = datetime.strptime(time_str, '%H:%M')
        new_time = t + timedelta(minutes=minutes)
        return new_time.strftime('%H:%M')

    # Auto-generate time slots if empty
    if not time_slots:
        slots = []
        current = start_time
        slot_num = 1
        while current < end_time:
            slot_end = time_add_minutes(current, slot_duration)
            if slot_end > end_time:
                break
            slots.append({
                'start': current,
                'end': slot_end,
                'label': f'Period {slot_num}'
            })
            current = slot_end
            slot_num += 1
        time_slots = slots

    preview = {
        'working_days': working_days,
        'time_slots': time_slots,
        'breaks': breaks,
        'total_slots_per_day': len(time_slots),
        'total_slots_per_week': len(time_slots) * len(working_days),
        'slot_duration_minutes': slot_duration,
        'schedule_grid': {
            day: [{'time': slot, 'is_break': any(
                slot['start'] == b['start'] and slot['end'] == b['end'] for b in breaks
            )} for slot in time_slots]
            for day in working_days
        }
    }

    return jsonify(preview), 200
