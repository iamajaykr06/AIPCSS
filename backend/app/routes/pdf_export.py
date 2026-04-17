"""
PDF Timetable Export - Generates printable timetables matching manual format.

Produces landscape A4 PDFs with:
- Department header with semester/season info
- Multi-batch grid (days as columns, time periods as rows)
- Cell format: FULL_COURSE_NAME (T/P) - (FACULTY_ABBR)  [word-wrapped]
- LUNCH BREAK row
- Course Details legend table: Code -> Full Name -> Type
- Faculty Details legend table: Abbreviation -> Full Name
- Signature line
- Color-coded batch rows
"""

from flask import Blueprint, request, send_file
from flask_jwt_extended import jwt_required
from io import BytesIO
from collections import defaultdict

from ..models import (
    Teacher, Course, Section, Room, TimetableEntry,
    Department, ScheduleSettings, Program, Batch,
)
from .. import db

pdf_export_bp = Blueprint('pdf_export', __name__)

# ── Colour palette (matching the manual PDF style) ────────────────────────

BATCH_COLORS = [
    (0.56, 0.93, 0.56),  # green
    (0.53, 0.81, 0.92),  # blue
    (0.87, 0.63, 0.87),  # plum
    (0.96, 0.64, 0.38),  # sandy
    (1.00, 0.71, 0.76),  # pink
    (0.13, 0.70, 0.67),  # teal
    (0.60, 0.98, 0.60),  # light green
    (0.53, 0.81, 0.98),  # light blue
    (0.85, 0.75, 0.85),  # lavender
    (1.00, 0.87, 0.50),  # gold
]

BREAK_BG = (1.0, 1.0, 0.84)  # light yellow
DAY_HEADER_BG = (0.90, 0.93, 1.0)


# ── Font helpers ─────────────────────────────────────────────────────────

def _register_fonts():
    """
    Register DejaVu fonts cross-platform (Windows + Linux + macOS).
    Falls back to built-in Helvetica / Helvetica-Bold if TTF files are not found.
    Returns a tuple (normal_font, bold_font) with the names actually registered.
    """
    import os
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    candidate_dirs = [
        # Linux
        '/usr/share/fonts/truetype/dejavu',
        '/usr/share/fonts/dejavu',
        '/usr/local/share/fonts',
        # Windows
        r'C:\Windows\Fonts',
        os.path.join(os.environ.get('WINDIR', r'C:\Windows'), 'Fonts'),
        # macOS
        '/Library/Fonts',
        '/System/Library/Fonts',
    ]

    font_files = {
        'DejaVu':     'DejaVuSans.ttf',
        'DejaVuBold': 'DejaVuSans-Bold.ttf',
    }

    already = set(pdfmetrics.getRegisteredFontNames())
    registered = {}

    for font_key, ttf_name in font_files.items():
        if font_key in already:
            registered[font_key] = font_key
            continue

        found = False
        for directory in candidate_dirs:
            full_path = os.path.join(directory, ttf_name)
            if os.path.isfile(full_path):
                try:
                    pdfmetrics.registerFont(TTFont(font_key, full_path))
                    registered[font_key] = font_key
                    found = True
                    break
                except Exception:
                    pass

        if not found:
            # Map to built-in Helvetica so we never crash
            fallback = 'Helvetica-Bold' if 'Bold' in font_key else 'Helvetica'
            registered[font_key] = fallback

    return registered.get('DejaVu', 'Helvetica'), registered.get('DejaVuBold', 'Helvetica-Bold')


# Module-level font names (resolved once at import time is avoided; resolved per call)
def _get_fonts():
    return _register_fonts()


# ── Helpers ──────────────────────────────────────────────────────────────

def _auto_abbreviation(name: str) -> str:
    """Create initials-based abbreviation when none is set."""
    if not name:
        return "?"
    parts = name.replace(".", "").replace("-", " ").split()
    if len(parts) >= 2:
        return (parts[0][0] + parts[-1][0]).upper()
    return name[:2].upper() if len(name) >= 2 else name.upper()


def _make_styles(normal_font='Helvetica', bold_font='Helvetica-Bold'):
    """Return a dict of reusable ParagraphStyle objects."""
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm

    return {
        "title": ParagraphStyle(
            'CustomTitle', fontName=bold_font, fontSize=14, alignment=1,
            spaceAfter=2 * mm, textColor=colors.black,
        ),
        "subtitle": ParagraphStyle(
            'CustomSubtitle', fontName=normal_font, fontSize=9, alignment=1,
            spaceAfter=4 * mm, textColor=colors.HexColor("#333333"),
        ),
        "cell": ParagraphStyle(
            'Cell', fontName=normal_font, fontSize=5, leading=6.2, alignment=1,
            spaceBefore=0, spaceAfter=0,
        ),
        "day_header": ParagraphStyle(
            'DayHeader', fontName=bold_font, fontSize=7, leading=9, alignment=1,
            textColor=colors.HexColor("#1a1a1a"),
        ),
        "batch_label": ParagraphStyle(
            'BatchLabel', fontName=bold_font, fontSize=5, leading=7, alignment=1,
            textColor=colors.HexColor("#1a1a1a"),
        ),
        "section_title": ParagraphStyle(
            'SectionTitle', fontName=bold_font, fontSize=9, spaceAfter=2 * mm,
            spaceBefore=4 * mm,
        ),
        "legend_text": ParagraphStyle(
            'LegendText', fontName=normal_font, fontSize=7, leading=9,
        ),
        "signature": ParagraphStyle(
            'Signature', fontName=normal_font, fontSize=9, alignment=0,
            spaceBefore=10 * mm,
        ),
    }



def _build_course_legend_table(entries, courses, avail_w, styles, normal_font='Helvetica', bold_font='Helvetica-Bold'):
    """
    Build a Course Details legend: Code | Full Name | Type.
    Only includes courses that appear in this department's timetable entries.
    """
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import Table, TableStyle, Paragraph

    # Collect unique course ids from entries
    seen_course_ids = set()
    unique_courses = []
    for e in entries:
        if e.course_id not in seen_course_ids:
            seen_course_ids.add(e.course_id)
            c = courses.get(e.course_id)
            if c:
                unique_courses.append(c)

    if not unique_courses:
        return []

    unique_courses.sort(key=lambda c: c.code or c.name)

    elements = []
    elements.append(Paragraph("<b>Course Details</b>", styles["section_title"]))

    ch_style = ParagraphStyle('CH', fontName=bold_font, fontSize=6.5, leading=8, alignment=0)
    ch_right = ParagraphStyle('CHR', fontName=bold_font, fontSize=6.5, leading=8, alignment=1)
    ct_style = ParagraphStyle('CT', fontName=normal_font, fontSize=7, leading=9, alignment=1)

    header = [
        Paragraph("<b>Code</b>", ch_style),
        Paragraph("<b>Course Name</b>", ch_style),
        Paragraph("<b>Type</b>", ch_right),
    ]

    rows = [header]
    code_w = 30 * mm
    type_w = 15 * mm
    name_w = avail_w - code_w - type_w

    for c in unique_courses:
        code_text = c.code or "-"
        name_text = c.name or "-"
        ctype = (c.course_type or "Theory").capitalize()
        rows.append([
            code_text,
            name_text,
            Paragraph(ctype, ct_style),
        ])

    tbl = Table(rows, colWidths=[code_w, name_w, type_w])
    tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#2a3990")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), bold_font),
        ('FONTSIZE', (0, 0), (-1, -1), 8),

        ('FONTNAME', (0, 1), (-1, -1), normal_font),
        ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor("#999999")),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ('LEFTPADDING', (0, 0), (-1, -1), 3),
        ('RIGHTPADDING', (0, 0), (-1, -1), 3),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f5fa")]),
    ]))
    elements.append(tbl)
    return elements


def _build_faculty_legend_table(entries, teachers, avail_w, styles, normal_font='Helvetica', bold_font='Helvetica-Bold'):
    """
    Build a Faculty Details legend: Abbreviation | Full Name.
    Only includes teachers that appear in this department's timetable entries.
    """
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import Table, TableStyle, Paragraph

    seen_teacher_ids = set()
    teacher_list = []
    for e in entries:
        if e.teacher_id not in seen_teacher_ids:
            seen_teacher_ids.add(e.teacher_id)
            t = teachers.get(e.teacher_id)
            if t:
                teacher_list.append(t)

    if not teacher_list:
        return []

    teacher_list.sort(key=lambda t: t.name)

    elements = []
    elements.append(Paragraph("<b>Faculty Details</b>", styles["section_title"]))

    header_style = ParagraphStyle('FH', fontName=bold_font, fontSize=6.5, leading=8, alignment=0)
    half = (len(teacher_list) + 1) // 2

    header = [
        Paragraph("<b>Abbreviation</b>", header_style),
        Paragraph("<b>Faculty Name</b>", header_style),
        Paragraph("<b>Abbreviation</b>", header_style),
        Paragraph("<b>Faculty Name</b>", header_style),
    ]
    rows = [header]

    col_w = avail_w / 4
    for i in range(half):
        left = teacher_list[i]
        right = teacher_list[i + half] if i + half < len(teacher_list) else None

        la = left.abbreviation or _auto_abbreviation(left.name)
        left_row = [la, left.name]
        right_row = [
            (right.abbreviation or _auto_abbreviation(right.name)) if right else "",
            right.name if right else "",
        ]
        rows.append(left_row + right_row)

    tbl = Table(rows, colWidths=[col_w, col_w, col_w, col_w])
    tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#2a3990")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), bold_font),
        ('FONTSIZE', (0, 1), (-1, -1), 8),

        ('FONTNAME', (0, 1), (-1, -1), normal_font),
        ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor("#999999")),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ('LEFTPADDING', (0, 0), (-1, -1), 3),
        ('RIGHTPADDING', (0, 0), (-1, -1), 3),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f5fa")]),
    ]))
    elements.append(tbl)
    return elements


def _build_primary_rooms(grid):
    """Determine the most-used room per batch from the grid."""
    batch_rooms = {}
    for day, day_grid in grid.items():
        for timeslot, batch_grid in day_grid.items():
            for batch_id, entries_list in batch_grid.items():
                for entry_data in entries_list:
                    if entry_data["room"]:
                        room_name = entry_data["room"].name
                        batch_rooms.setdefault(batch_id, defaultdict(int))
                        batch_rooms[batch_id][room_name] += 1
    batch_primary_room = {}
    for bid, room_counts in batch_rooms.items():
        batch_primary_room[bid] = max(room_counts, key=room_counts.get)
    return batch_primary_room


def _build_content_rows(all_slots, working_days, batches, grid, cell_style):
    """Build the timetable content rows (time slot rows with entries)."""
    from reportlab.platypus import Paragraph

    content_rows = []
    num_batches = len(batches)

    for slot_info in all_slots:
        row = []
        is_break = slot_info["is_break"]

        if is_break:
            row.append("")
            row.append("")
            for _ in range(len(working_days) * num_batches):
                row.append("LUNCH\nBREAK")
            content_rows.append(row)
            continue

        # Period number
        period_num = ""
        p_count = 0
        for s in all_slots:
            if not s["is_break"]:
                p_count += 1
                if s["key"] == slot_info["key"]:
                    period_num = f"Period {p_count}"
                    break

        row.append(period_num)
        row.append(slot_info["label"])

        for day in working_days:
            day_slots = grid.get(day, {})
            slot_entries = day_slots.get(slot_info["key"], {})

            for batch in batches:
                entries_list = slot_entries.get(batch.id, [])
                if not entries_list:
                    row.append("")
                    continue

                entry = entries_list[0]
                course = entry["course"]
                teacher = entry["teacher"]
                if not course:
                    row.append("")
                    continue

                # FULL COURSE NAME (T/P) - (FACULTY_ABBR)
                course_name = course.name or course.code or ""
                course_type = "P" if entry["is_lab"] else "T"
                abbr = teacher.abbreviation or _auto_abbreviation(teacher.name) if teacher else "?"

                cell_text = f"{course_name} ({course_type})<br/>({abbr})"
                row.append(Paragraph(cell_text, cell_style))

        content_rows.append(row)

    return content_rows


def _build_table_style_cmds(all_slots, working_days, batches, has_break):
    """Build TableStyle commands for the timetable grid."""
    from reportlab.lib import colors

    num_batches = len(batches)
    batch_col_start = 2

    style_cmds = [
        ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor("#999999")),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('FONTSIZE', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ('LEFTPADDING', (0, 0), (-1, -1), 2),
        ('RIGHTPADDING', (0, 0), (-1, -1), 2),
        # Header rows styling
        ('BACKGROUND', (0, 0), (1, 2), colors.HexColor("#2a3990")),
        ('TEXTCOLOR', (0, 0), (1, 2), colors.white),
        ('FONTNAME', (0, 0), (1, 2), 'Helvetica-Bold'),
    ]

    # Day header spans
    col_idx = batch_col_start
    for _di, day in enumerate(working_days):
        span_end = col_idx + num_batches - 1
        style_cmds.append(('SPAN', (col_idx, 0), (span_end, 0)))
        style_cmds.append(('BACKGROUND', (col_idx, 0), (span_end, 0), DAY_HEADER_BG))
        style_cmds.append(('ALIGN', (col_idx, 0), (span_end, 0), 'CENTER'))
        col_idx += num_batches

    # Batch label row colours
    col_idx = batch_col_start
    for di, day in enumerate(working_days):
        for bi, batch in enumerate(batches):
            bg = BATCH_COLORS[(di * num_batches + bi) % len(BATCH_COLORS)]
            style_cmds.append(('BACKGROUND', (col_idx, 2), (col_idx, 2),
                              colors.Color(*bg, alpha=0.3)))
            col_idx += 1

    # Content row column colours (subtle alternating)
    col_idx = batch_col_start
    for di, day in enumerate(working_days):
        for bi, batch in enumerate(batches):
            bg = BATCH_COLORS[(di * num_batches + bi) % len(BATCH_COLORS)]
            alpha = 0.08 if bi % 2 == 0 else 0.15
            style_cmds.append(('BACKGROUND', (col_idx, 3), (col_idx, -1),
                              colors.Color(*bg, alpha=alpha)))
            col_idx += 1

    # Break row styling
    for ri, slot_info in enumerate(all_slots):
        if slot_info["is_break"]:
            row_num = 3 + ri
            style_cmds.append(('BACKGROUND', (2, row_num), (-1, row_num), BREAK_BG))
            style_cmds.append(('SPAN', (0, row_num), (1, row_num)))
            style_cmds.append(('ALIGN', (0, row_num), (-1, row_num), 'CENTER'))
            style_cmds.append(('FONTNAME', (0, row_num), (-1, row_num), 'Helvetica-Bold'))

    return style_cmds


# ── Data loader ──────────────────────────────────────────────────────────

def _build_timetable_data(dept_id: int, program_id=None, batch_id=None, section_id=None):
    """Load and organise timetable data for PDF rendering."""
    dept = db.session.get(Department, dept_id)
    if not dept:
        return None

    query = TimetableEntry.query.filter_by(department_id=dept_id)
    
    # Apply filters
    if section_id:
        query = query.filter(TimetableEntry.sections.any(id=section_id))
    elif batch_id:
        query = query.filter(TimetableEntry.sections.any(Section.batch_id == batch_id))
    elif program_id:
        query = query.filter(TimetableEntry.sections.any(Section.batch.has(Batch.program_id == program_id)))

    entries = query.all()

    if not entries:
        return None

    course_ids = {e.course_id for e in entries}
    teacher_ids = {e.teacher_id for e in entries}
    room_ids = {e.room_id for e in entries}
    section_ids = set()
    for e in entries:
        for s in e.sections:
            section_ids.add(s.id)

    courses = {c.id: c for c in Course.query.filter(Course.id.in_(course_ids)).all()}
    teachers = {t.id: t for t in Teacher.query.filter(Teacher.id.in_(teacher_ids)).all()}
    rooms = {r.id: r for r in Room.query.filter(Room.id.in_(room_ids)).all()}
    sections = {s.id: s for s in Section.query.filter(Section.id.in_(section_ids)).all()}

    # Group sections by batch -> program
    batch_map = {}
    for sec in sections.values():
        batch_map[sec.batch_id] = sec.batch

    # Deduplicate batches per program
    seen_batches = set()
    unique_batches = []
    for batch_id, batch in batch_map.items():
        key = (batch.program_id, batch.code or batch.name)
        if key not in seen_batches:
            seen_batches.add(key)
            unique_batches.append(batch)

    unique_batches.sort(key=lambda b: (
        b.program.name if b.program else "",
        b.code or b.name,
    ))

    # Build grid: day -> timeslot -> batch_id -> entry list
    grid = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
    for e in entries:
        course = courses.get(e.course_id)
        teacher = teachers.get(e.teacher_id)
        room = rooms.get(e.room_id)
        for sec in e.sections:
            grid[e.day][e.timeslot][sec.batch_id].append({
                "course": course,
                "teacher": teacher,
                "room": room,
                "entry_id": e.id,
                "is_lab": course and course.course_type == "Lab",
            })

    # Schedule settings
    settings = ScheduleSettings.get_or_create_default()
    time_slots = settings.time_slots or []
    working_days = settings.working_days or ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    breaks = settings.breaks or []
    all_slots = []
    for ts in time_slots:
        all_slots.append({
            "key": f"{ts['start']}-{ts['end']}",
            "label": ts.get("label", f"{ts['start']}-{ts['end']}"),
            "start": ts["start"],
            "end": ts["end"],
            "is_break": False,
        })
    for br in breaks:
        all_slots.append({
            "key": f"break-{br['start']}-{br['end']}",
            "label": br.get("label", "BREAK"),
            "start": br["start"],
            "end": br["end"],
            "is_break": True,
        })

    return {
        "department": dept,
        "entries": entries,
        "unique_batches": unique_batches,
        "batch_map": batch_map,
        "grid": grid,
        "courses": courses,
        "teachers": teachers,
        "rooms": rooms,
        "sections": sections,
        "all_slots": all_slots,
        "working_days": working_days,
        "time_slots": time_slots,
        "breaks": breaks,
    }


# ── Single-department PDF ────────────────────────────────────────────────

def _render_pdf(data, semester_label=""):
    """Render the timetable data into a PDF bytes buffer using ReportLab."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Spacer, Paragraph
    from reportlab.lib.styles import ParagraphStyle

    normal_font, bold_font = _register_fonts()
    styles = _make_styles(normal_font, bold_font)

    dept = data["department"]
    batches = data["unique_batches"]
    grid = data["grid"]
    all_slots = data["all_slots"]
    working_days = data["working_days"]

    buf = BytesIO()
    page_w, page_h = landscape(A4)
    doc = SimpleDocTemplate(
        buf, pagesize=landscape(A4),
        leftMargin=10 * mm, rightMargin=10 * mm,
        topMargin=10 * mm, bottomMargin=10 * mm,
    )

    elements = []

    # ── Title ────────────────────────────────────────────────────────────
    elements.append(Paragraph(f"Time Table {semester_label}", styles["title"]))
    elements.append(Paragraph(f"Department of {dept.name}", styles["subtitle"]))

    # ── Table Construction (Image-matching structure) ────────────────────
    # Columns: [BATCH, SLOT1, SLOT2, ...]
    header_row = [Paragraph("<b>BATCH / TIME</b>", styles["day_header"])]
    for slot in all_slots:
        # Show both slot label (e.g. Period 1) and actual time
        time_str = f"{slot['start']}-{slot['end']}"
        label = slot['label']
        if label and label != time_str:
            slot_label = f"<b>{label}</b><br/><font size='7' color='#475569'>{time_str}</font>"
        else:
            slot_label = f"<b>{time_str}</b>"
        header_row.append(Paragraph(slot_label, styles["day_header"]))


    table_data = [header_row]
    style_cmds = [
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#f8fafc")),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]

    current_row = 1
    avail_w = page_w - 20 * mm
    
    for day in working_days:
        # Day Header Row
        day_header = [Paragraph(f"<b>{day.upper()}</b>", styles["day_header"])] + [""] * len(all_slots)
        table_data.append(day_header)
        style_cmds.append(('SPAN', (0, current_row), (-1, current_row)))
        style_cmds.append(('BACKGROUND', (0, current_row), (-1, current_row), colors.HexColor("#f0f7ff")))
        style_cmds.append(('TEXTCOLOR', (0, current_row), (-1, current_row), colors.HexColor("#1e40af")))
        current_row += 1

        # Rows for each batch
        for batch in batches:
            # Determine the theory room used by this batch on this specific day
            day_theory_room = None
            day_slots = grid.get(day, {})
            for slot_key, batch_entries in day_slots.items():
                entries = batch_entries.get(batch.id, [])
                for e in entries:
                    if not e["is_lab"] and e["room"]:
                        day_theory_room = e["room"].name
                        break
                if day_theory_room: break

            batch_label_txt = f"<b>{batch.name}</b>"
            if day_theory_room:
                batch_label_txt += f"<br/><font color='#1e40af' size='4'>[{day_theory_room}]</font>"
                
            row = [Paragraph(batch_label_txt, styles["batch_label"])]
            
            for slot_info in all_slots:
                if slot_info["is_break"]:
                    row.append(Paragraph("<b>LUNCH BREAK</b>", styles["cell"]))
                    style_cmds.append(('BACKGROUND', (len(row)-1, current_row), (len(row)-1, current_row), colors.HexColor("#fff7ed")))
                    continue

                entries_list = grid[day][slot_info["key"]].get(batch.id, [])
                if not entries_list:
                    row.append("")
                    continue

                entry = entries_list[0]
                course_name = entry["course"].name if entry["course"] else "Course"
                teacher_abbr = entry["teacher"].abbreviation or _auto_abbreviation(entry["teacher"].name) if entry["teacher"] else "?"
                ctype = "P" if entry["is_lab"] else "T"
                
                cell_txt = f"<b>{course_name}</b> ({ctype})<br/>({teacher_abbr})"
                
                # Rule: Lab room always shows in cell. Theory room only shows if it differs from batch header room.
                if entry["is_lab"] and entry["room"]:
                    cell_txt += f"<br/><font color='#b91c1c'>[{entry['room'].name}]</font>"
                elif entry["room"] and entry["room"].name != day_theory_room:
                    cell_txt += f"<br/>[{entry['room'].name}]"
                
                row.append(Paragraph(cell_txt, styles["cell"]))
                
                # Color coding background
                bg_color = colors.HexColor("#f0fdf4") if entry["is_lab"] else colors.HexColor("#eff6ff")
                style_cmds.append(('BACKGROUND', (len(row)-1, current_row), (len(row)-1, current_row), bg_color))

            table_data.append(row)
            current_row += 1

    # Col Widths
    batch_col_w = 35 * mm
    slot_col_w = (avail_w - batch_col_w) / len(all_slots)
    col_widths = [batch_col_w] + [slot_col_w] * len(all_slots)

    table = Table(table_data, colWidths=col_widths, repeatRows=1)
    table.setStyle(TableStyle(style_cmds))
    elements.append(table)

    # ── Faculty Details Legend ───────────────────────────────────────────
    elements.append(Spacer(1, 10 * mm))
    faculty_elements = _build_faculty_legend_table(
        data["entries"], data["teachers"], avail_w, styles, normal_font, bold_font,
    )
    elements.extend(faculty_elements)

    # ── Signature line ──────────────────────────────────────────────────
    elements.append(Spacer(1, 12 * mm))
    elements.append(Paragraph(
        "Signature: ________________________    HOD / Coordinator",
        styles["signature"],
    ))

    # ── Build PDF ───────────────────────────────────────────────────────
    doc.build(elements)
    buf.seek(0)
    return buf


# ══════════════════════════════════════════════════════════════════════════
# ROUTES
# ══════════════════════════════════════════════════════════════════════════

@pdf_export_bp.route('/ping', methods=['GET'])
def ping():
    return {"message": "PDF blueprint is reachable"}, 200

@pdf_export_bp.route('/all', methods=['GET'])
@jwt_required()
def export_all_departments_pdf():
    """Generate and download a combined PDF with all department timetables."""
    try:
        from reportlab.lib.pagesizes import A4, landscape
        from reportlab.lib.units import mm
        from reportlab.platypus import SimpleDocTemplate, PageBreak

        normal_font, bold_font = _register_fonts()

        departments = Department.query.all()
        if not departments:
            return {"error": "No departments found"}, 404

        buf = BytesIO()
        page_w, page_h = landscape(A4)

        doc = SimpleDocTemplate(
            buf, pagesize=landscape(A4),
            leftMargin=10 * mm, rightMargin=10 * mm,
            topMargin=10 * mm, bottomMargin=10 * mm,
        )

        elements = []
        first = True
        for dept in departments:
            data = _build_timetable_data(dept.id)
            if not data:
                continue

            if not first:
                elements.append(PageBreak())
            first = False

            part_elements = _build_department_table(data, page_w, normal_font, bold_font)
            elements.extend(part_elements)

        if not elements:
            return {"error": "No timetable data found."}, 404

        doc.build(elements)
        buf.seek(0)
        return send_file(
            buf,
            mimetype='application/pdf',
            as_attachment=True,
            download_name='Timetable_All_Departments.pdf',
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": f"PDF generation failed: {str(e)}"}, 500


@pdf_export_bp.route('/<int:dept_id>', methods=['GET'])
@jwt_required()
def export_department_pdf(dept_id):
    """Generate and download a PDF timetable for a single department."""
    try:
        program_id = request.args.get('program_id', type=int)
        batch_id = request.args.get('batch_id', type=int)
        section_id = request.args.get('section_id', type=int)

        data = _build_timetable_data(dept_id, program_id, batch_id, section_id)
        if not data:
            return {"error": "No timetable found with the selected filters."}, 404

        semester_label = request.args.get('semester', f" - {data['department'].name}")
        pdf_buf = _render_pdf(data, semester_label)

        safe_name = data["department"].name.replace(" ", "_").replace("/", "-")
        return send_file(
            pdf_buf,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=f'Timetable_{safe_name}.pdf',
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": f"PDF generation failed: {str(e)}"}, 500



def _build_department_table(data, page_w, normal_font='Helvetica', bold_font='Helvetica-Bold'):
    """Build platypus elements for a single department (used in combined PDF)."""
    from reportlab.platypus import Table, TableStyle, Spacer, Paragraph
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    
    styles = _make_styles(normal_font, bold_font)

    dept = data["department"]
    batches = data["unique_batches"]
    grid = data["grid"]
    all_slots = data["all_slots"]
    working_days = data["working_days"]

    elements = []
    elements.append(Paragraph(f"Time Table - {dept.name}", styles["title"]))
    elements.append(Spacer(1, 5 * mm))

    # Header Row
    header_row = [Paragraph("<b>BATCH</b>", styles["day_header"])]
    for slot in all_slots:
        header_row.append(Paragraph(f"<b>SLOT</b><br/>{slot['label']}", styles["day_header"]))

    table_data = [header_row]
    style_cmds = [
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#f8fafc")),
    ]

    current_row = 1
    for day in working_days:
        # Day Header
        day_header = [Paragraph(f"<b>{day.upper()}</b>", styles["day_header"])] + [""] * len(all_slots)
        table_data.append(day_header)
        style_cmds.append(('SPAN', (0, current_row), (-1, current_row)))
        style_cmds.append(('BACKGROUND', (0, current_row), (-1, current_row), colors.HexColor("#f0f7ff")))
        current_row += 1

        for batch in batches:
            row = [Paragraph(f"<b>{batch.name}</b>", styles["batch_label"])]
            for slot_info in all_slots:
                if slot_info["is_break"]:
                    row.append(Paragraph("LUNCH", styles["cell"]))
                    continue
                    
                entries = grid[day][slot_info["key"]].get(batch.id, [])
                if not entries:
                    row.append("")
                    continue
                    
                entry = entries[0]
                teacher_abbr = entry["teacher"].abbreviation or _auto_abbreviation(entry["teacher"].name) if entry["teacher"] else "?"
                cell_txt = f"<b>{entry['course'].name if entry['course'] else 'Course'}</b> ({teacher_abbr})"
                row.append(Paragraph(cell_txt, styles["cell"]))
                
                bg_color = colors.HexColor("#f0fdf4") if entry["is_lab"] else colors.HexColor("#eff6ff")
                style_cmds.append(('BACKGROUND', (len(row)-1, current_row), (len(row)-1, current_row), bg_color))

            table_data.append(row)
            current_row += 1

    avail_w = page_w - 20 * mm
    batch_col_w = 35 * mm
    slot_col_w = (avail_w - batch_col_w) / len(all_slots)
    
    table = Table(table_data, colWidths=[batch_col_w] + [slot_col_w] * len(all_slots), repeatRows=1)
    table.setStyle(TableStyle(style_cmds))
    elements.append(table)
    
    elements.append(Spacer(1, 10 * mm))
    elements.extend(_build_faculty_legend_table(data["entries"], data["teachers"], avail_w, styles, normal_font, bold_font))
    
    elements.append(Spacer(1, 10 * mm))
    elements.append(Paragraph("Signature: ________________________    HOD / Coordinator", styles["signature"]))

    return elements

